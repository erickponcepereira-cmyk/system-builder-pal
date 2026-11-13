-- Estorno de pedido da loja da academia estorna a mensalidade que a compra gerou.
--
-- Achado em 12/11/2026. A compra de produto vinculado em
-- academia_produtos_mensalidade gera uma mensalidade 'ativa' com
-- partner_order_id (academia_mensalidade_gerar_pedido, pelo gatilho
-- trg_academia_mensalidade_do_pedido). O estorno do pedido (executarEstorno,
-- src/lib/refunds.functions.ts) cancelava comissoes e beneficios, mas nao
-- tocava nela: a catraca continuava liberando quem teve o dinheiro devolvido.
--
-- A mensalidade vira 'estornada', status que ja existia e que a recepcao ja usa
-- (cancelarMensalidadeAcademia). Catraca (academia_agente_retrato), tela
-- (acesso_avaliar, acesso_avaliar_academia) e relatorios so leem 'ativa', entao
-- a pessoa volta ao vencimento que tinha sem esta compra, e o dinheiro sai do
-- relatorio da academia.
--
-- O que sobra e o encadeamento. Quem renova com a anterior em vigor soma em
-- cima dela (157 de 404 lancamentos no balcao em 12/11/2026). Exemplo: compra
-- no app em 01/11 ate 01/12, renovacao no balcao em 25/11 por 30 dias ate 31/12.
-- So estornar a compra deixaria a pessoa ate 31/12, com os dias devolvidos. A
-- regra aqui e refazer a conta como se a compra estornada nao existisse: a
-- renovacao passa a 25/12 (25/11 + 30). O passado nao volta: os dias ja usados
-- da compra estornada nao sao cobrados de ninguem.
--
-- Cada renovacao posterior e refeita com a regra que a criou:
-- - balcao (academia_renovar) e politica 'justa': base = maior entre o teto e
--   o dia do lancamento;
-- - 'vencimento': base = teto, mesmo vencido;
-- - 'pagamento': base = o dia; nao encadeia e nao muda.
-- O recuo e (base com a compra) - (base sem ela), aplicado so a quem passou da
-- base. Importacao (importado_de) nao encadeia e fica como esta. Data digitada
-- a mao na recepcao (p_valido_ate) e tratada como renovacao comum.
--
-- Idempotente: so age sobre mensalidade 'ativa' do pedido. Chamada de novo, nao
-- acha nada e devolve zero.
--
-- So o servidor chama (executarEstorno, cliente admin, depois de conferir
-- role = 'admin'). Funcao nova nasce com EXECUTE para anon e authenticated,
-- por isso o REVOKE.

CREATE OR REPLACE FUNCTION public.academia_mensalidade_estornar_pedido(
  p_order_id uuid,
  p_cancelado_por uuid,
  p_motivo text
)
RETURNS TABLE(estornadas integer, recuadas integer)
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  r RECORD;
  l RECORD;
  v_pedido text;
  v_tz text;
  v_dia date;
  v_teto_com date;
  v_teto_sem date;
  v_base_com date;
  v_base_sem date;
  v_novo date;
BEGIN
  estornadas := 0;
  recuadas := 0;

  SELECT a.* INTO r
    FROM public.academia_mensalidades a
   WHERE a.partner_order_id = p_order_id
     AND a.status = 'ativa'
   FOR UPDATE;

  IF r.id IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.academia_mensalidades
     SET status = 'estornada',
         cancelado_em = now(),
         cancelado_por = p_cancelado_por,
         motivo_cancelamento = p_motivo
   WHERE id = r.id;
  estornadas := 1;

  SELECT o.order_number INTO v_pedido
    FROM public.partner_product_orders o WHERE o.id = p_order_id;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = r.partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');

  -- O teto que a pessoa tinha quando comprou: sem a compra, e com ela.
  SELECT max(a.valido_ate) INTO v_teto_sem
    FROM public.academia_mensalidades a
   WHERE a.partner_id = r.partner_id
     AND a.status = 'ativa'
     AND a.created_at < r.created_at
     AND ((r.credencial_id IS NOT NULL AND a.credencial_id = r.credencial_id)
       OR (r.student_id IS NOT NULL AND a.student_id = r.student_id));
  v_teto_com := GREATEST(v_teto_sem, r.valido_ate);

  FOR l IN
    SELECT a.id, a.valido_ate, a.created_at, a.importado_de, a.observacao,
           COALESCE(
             (SELECT pm.politica_renovacao
                FROM public.partner_product_orders o
                JOIN public.academia_produtos_mensalidade pm
                  ON pm.partner_product_id = o.partner_product_id
               WHERE o.id = a.partner_order_id
               ORDER BY pm.ativo DESC
               LIMIT 1),
             (SELECT pm.politica_renovacao
                FROM public.transactions t
                JOIN public.academia_produtos_mensalidade pm
                  ON pm.product_id = t.product_id
               WHERE t.id = a.transaction_id
               ORDER BY pm.ativo DESC
               LIMIT 1),
             'justa'
           ) AS politica
      FROM public.academia_mensalidades a
     WHERE a.partner_id = r.partner_id
       AND a.status = 'ativa'
       AND a.created_at > r.created_at
       AND ((r.credencial_id IS NOT NULL AND a.credencial_id = r.credencial_id)
         OR (r.student_id IS NOT NULL AND a.student_id = r.student_id))
     ORDER BY a.created_at, a.id
     FOR UPDATE OF a
  LOOP
    v_dia := (l.created_at AT TIME ZONE v_tz)::date;
    v_base_com := CASE l.politica
      WHEN 'vencimento' THEN COALESCE(v_teto_com, v_dia)
      WHEN 'pagamento' THEN v_dia
      ELSE GREATEST(v_teto_com, v_dia)
    END;
    v_base_sem := CASE l.politica
      WHEN 'vencimento' THEN COALESCE(v_teto_sem, v_dia)
      WHEN 'pagamento' THEN v_dia
      ELSE GREATEST(v_teto_sem, v_dia)
    END;
    v_novo := l.valido_ate;

    IF l.importado_de IS NULL AND l.valido_ate > v_base_com AND v_base_com > v_base_sem THEN
      v_novo := l.valido_ate - (v_base_com - v_base_sem);
      UPDATE public.academia_mensalidades
         SET valido_ate = v_novo,
             observacao = concat_ws(E'\n', l.observacao, format(
               'Validade recuada de %s para %s: renovou em cima da compra %s, estornada.',
               to_char(l.valido_ate, 'DD/MM/YYYY'),
               to_char(v_novo, 'DD/MM/YYYY'),
               COALESCE(v_pedido, p_order_id::text)))
       WHERE id = l.id;
      recuadas := recuadas + 1;
    END IF;

    v_teto_com := GREATEST(v_teto_com, l.valido_ate);
    v_teto_sem := GREATEST(v_teto_sem, v_novo);
  END LOOP;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.academia_mensalidade_estornar_pedido(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_mensalidade_estornar_pedido(uuid, uuid, text) TO service_role;
