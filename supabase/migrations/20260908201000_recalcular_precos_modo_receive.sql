-- Recalcular o preço de quem foi cadastrado em "quanto quero receber".
--
-- Por que existe: em `price_input_mode = 'receive'` o combinado com o prestador
-- é o `professional_net_amount`, e o `price` é derivado dele pela inversa da
-- cascata. Só que a venda parte do `price` gravado — nada no banco lê
-- `professional_net_amount` na hora de vender. Toda vez que a taxa da maquininha
-- muda, o preço gravado passa a devolver um valor diferente do combinado, em
-- silêncio. Apareceu quando a maquininha caiu de 4,98% para 2,99%: os 3.785
-- exames pagariam ao prestador ~2,1% a mais do que a tabela dele.

-- Roda a cascata de `create_partner_product_order` para frente e devolve o que
-- sobra para o prestador. Existe para o recálculo poder escolher o centavo
-- conferindo o resultado, em vez de confiar numa inversa que o arredondamento
-- por etapa torna aproximada.
CREATE OR REPLACE FUNCTION public.simular_liquido_da_cascata(
  _preco numeric, _fee_pct numeric, _tax_pct numeric, _sys_pct numeric, _com_pct numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $fn$
  WITH a AS (SELECT ROUND(_preco - ROUND(_preco * _fee_pct/100, 2), 2) AS rem),
       b AS (SELECT ROUND(a.rem - ROUND(a.rem * _tax_pct/100, 2), 2) AS rem FROM a),
       c AS (SELECT ROUND(b.rem - ROUND(b.rem * _sys_pct/100, 2), 2) AS rem FROM b)
  SELECT ROUND(c.rem - ROUND(c.rem * _com_pct/100, 2), 2) FROM c;
$fn$;

-- Devolve só os produtos cujo preço mudaria. Com `_aplicar => false` é uma
-- simulação: nada é gravado, e a lista é a prévia.
--
-- Espelha `create_partner_product_order` passo a passo, incluindo o portão
-- `custom_split` — sem ele os overrides de imposto, sistema e rede são inertes,
-- e a conta sai errada exatamente como saiu na importação do catálogo.
CREATE OR REPLACE FUNCTION public.recalcular_precos_modo_receive(
  _data     date    DEFAULT CURRENT_DATE,
  _coach_id uuid    DEFAULT NULL,
  _aplicar  boolean DEFAULT false
)
RETURNS TABLE (
  produto_id    uuid,
  nome          text,
  combinado     numeric,
  preco_antes   numeric,
  preco_depois  numeric,
  confere       boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_fee_pct numeric;
  v_imposto numeric;
  v_sistema numeric;
BEGIN
  -- `is_admin` recebe o user_id, não é sem argumento. E `auth.uid()` é NULL
  -- quando isto roda como serviço (migration, MCP), que é justamente o caminho
  -- pelo qual o recálculo em massa acontece — por isso o NULL passa e só um
  -- usuário logado que não seja admin é barrado.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas admin pode recalcular preços';
  END IF;

  -- Cartão é o pior caso: a maquininha de cartão é mais cara que a de PIX, e
  -- precificar pelo PIX faria a venda no cartão pagar menos que o combinado.
  SELECT t.maquininha_cartao, t.imposto_pct, t.sistema_pct
    INTO v_fee_pct, v_imposto, v_sistema
    FROM public.taxa_vigente(_data) t;

  RETURN QUERY
  WITH alvo AS (
    SELECT p.id, p.name, p.price, p.professional_net_amount AS liquido,
           CASE WHEN COALESCE(p.custom_split,false) AND COALESCE(p.skip_tax,false)
                THEN 0 ELSE v_imposto END AS tax_pct,
           CASE WHEN COALESCE(p.custom_split,false) AND p.system_fee_pct_override IS NOT NULL
                THEN p.system_fee_pct_override ELSE v_sistema END AS sys_pct,
           COALESCE(p.coach_commission_percentage, 10) AS com_pct
      FROM public.professional_products p
     WHERE p.price_input_mode = 'receive'
       AND p.professional_net_amount IS NOT NULL
       AND p.professional_net_amount > 0
       -- Só o que está à venda. Produto desativado carrega preço velho de
       -- propósito: mexer nele daria a um catálogo aposentado um preço com
       -- régua nova, e é justamente onde moram os R$ 570 mil da importação
       -- antiga de Medicina.
       AND p.is_active_by_professional = true
       AND p.status = 'approved'
       AND (_coach_id IS NULL OR p.coach_id = _coach_id)
  ),
  bruto AS (
    -- Inversa dos fatores. O arredondamento por etapa da venda não tem inversa
    -- exata, então isto é só o candidato — o passo seguinte escolhe o centavo.
    SELECT a.*,
           a.liquido
             / NULLIF((1 - a.com_pct/100.0) * (1 - a.sys_pct/100.0)
                      * (1 - a.tax_pct/100.0) * (1 - v_fee_pct/100.0), 0) AS candidato
      FROM alvo a
  ),
  candidatos AS (
    -- Testa o centavo abaixo, o exato e o de cima, rodando a cascata para frente
    -- em cada um: fica com o que devolve o combinado mais de perto.
    SELECT b.*, c.preco,
           public.simular_liquido_da_cascata(c.preco, v_fee_pct, b.tax_pct, b.sys_pct, b.com_pct) AS devolve
      FROM bruto b
      CROSS JOIN LATERAL (
        VALUES (ROUND(b.candidato, 2)),
               (ROUND(b.candidato, 2) + 0.01),
               (ROUND(b.candidato, 2) - 0.01)
      ) AS c(preco)
     WHERE c.preco > 0
  ),
  melhor AS (
    -- Empate no erro resolve pelo menor preço: entre dois centavos que erram
    -- igual, o cliente paga o mais barato.
    SELECT DISTINCT ON (id)
           id, name, liquido, price, preco, devolve
      FROM candidatos
     ORDER BY id, abs(devolve - liquido), preco
  ),
  aplicado AS (
    -- CTE que escreve roda mesmo sem ser referenciada, e enxerga o mesmo
    -- snapshot que o SELECT abaixo — por isso `preco_antes` sai correto.
    UPDATE public.professional_products p
       SET price = m.preco
      FROM melhor m
     WHERE _aplicar AND p.id = m.id AND p.price IS DISTINCT FROM m.preco
     RETURNING p.id
  )
  SELECT m.id, m.name, m.liquido, m.price, m.preco, (m.devolve = m.liquido)
    FROM melhor m
   WHERE m.price IS DISTINCT FROM m.preco
   ORDER BY m.name;
END;
$fn$;

REVOKE ALL ON FUNCTION public.recalcular_precos_modo_receive(date, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalcular_precos_modo_receive(date, uuid, boolean) TO authenticated;
