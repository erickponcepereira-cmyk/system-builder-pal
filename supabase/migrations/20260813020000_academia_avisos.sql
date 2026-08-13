-- Avisos de vencimento da mensalidade de academia.
--
-- Marcos: 3, 2 e 1 dia antes, no dia do vencimento, e no ultimo dia de carencia
-- (a vespera do bloqueio). Todos derivam de acesso_avaliar_academia, entao usam
-- exatamente a mesma regua que libera a catraca.
--
-- O envio usa o robo que ja existe (bot_disparos + bot_disparo_alvos). Esta
-- migration NUNCA envia: ela monta campanhas em rascunho. Quem envia e
-- dispararCampanha, onde ficam o limite diario do chip e o intervalo entre
-- mensagens.

-- 1. Automacao e configuracao por academia ----------------------------------

ALTER TABLE public.partner_acesso_config
  ADD COLUMN IF NOT EXISTS avisos_automaticos boolean NOT NULL DEFAULT false;

-- Texto de cada marco, por academia. Sem linha aqui, vale o padrao do sistema.
-- ativo = false desliga aquele marco so para aquela academia.
CREATE TABLE IF NOT EXISTS public.academia_avisos_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  marco text NOT NULL CHECK (marco IN ('d3', 'd2', 'd1', 'd0', 'ultimo_dia')),
  texto text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_aviso_modelo_unico UNIQUE (partner_id, marco)
);

ALTER TABLE public.academia_avisos_modelos ENABLE ROW LEVEL SECURITY;

-- 2. Registro do que ja foi gerado ------------------------------------------
-- A chave inclui valido_ate: cada marco sai uma vez por vencimento. Renovou,
-- virou outro vencimento, o ciclo recomeca.
--
-- Registra que o aviso foi GERADO, nao que chegou. Quem sabe da entrega e
-- bot_disparo_alvos.status. Mesma disciplina do log da catraca.

CREATE TABLE IF NOT EXISTS public.academia_avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  marco text NOT NULL CHECK (marco IN ('d3', 'd2', 'd1', 'd0', 'ultimo_dia')),
  valido_ate date NOT NULL,
  disparo_id uuid REFERENCES public.bot_disparos(id) ON DELETE SET NULL,
  telefone text,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_aviso_unico UNIQUE (partner_id, student_id, marco, valido_ate)
);

ALTER TABLE public.academia_avisos ENABLE ROW LEVEL SECURITY;

-- Quem enxerga: master admin que tambem e membro ou dono daquela academia.
CREATE OR REPLACE FUNCTION public.academia_pode_ver(p_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_master_admin_atual()
     AND (
       EXISTS (
         SELECT 1 FROM public.partner_members pm
           JOIN public.profiles pr ON pr.id = pm.profile_id
          WHERE pm.partner_id = p_partner_id AND pr.user_id = auth.uid()
       )
       OR EXISTS (
         SELECT 1 FROM public.partners p
           JOIN public.profiles pr ON pr.id = p.profile_id
          WHERE p.id = p_partner_id AND pr.user_id = auth.uid()
       )
     );
$$;

DROP POLICY IF EXISTS academia_avisos_leitura ON public.academia_avisos;
CREATE POLICY academia_avisos_leitura ON public.academia_avisos
  FOR SELECT USING (public.academia_pode_ver(partner_id));

DROP POLICY IF EXISTS academia_modelos_leitura ON public.academia_avisos_modelos;
CREATE POLICY academia_modelos_leitura ON public.academia_avisos_modelos
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- 3. Texto padrao ------------------------------------------------------------
-- {nome} e resolvido pelo robo no envio; {data} e resolvido na montagem da
-- campanha, o que so e possivel porque todo mundo do mesmo marco compartilha o
-- mesmo vencimento naquele dia.

CREATE OR REPLACE FUNCTION public.academia_aviso_texto_padrao(p_marco text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_marco
    WHEN 'd3' THEN 'Oi {nome}! Sua mensalidade da academia vence em 3 dias, no dia {data}.'
    WHEN 'd2' THEN 'Oi {nome}! Faltam 2 dias para vencer sua mensalidade da academia ({data}).'
    WHEN 'd1' THEN 'Oi {nome}! Sua mensalidade da academia vence amanha, {data}.'
    WHEN 'd0' THEN 'Oi {nome}! Sua mensalidade da academia vence hoje ({data}). Renove para continuar treinando.'
    WHEN 'ultimo_dia' THEN 'Oi {nome}! Sua mensalidade venceu em {data} e hoje e o ultimo dia de acesso. Renove hoje para nao perder a entrada amanha.'
    ELSE 'Sua mensalidade da academia precisa de atencao.'
  END;
$$;

-- 4. Quem deve receber aviso hoje -------------------------------------------

CREATE OR REPLACE FUNCTION public.academia_avisos_pendentes(p_partner_id uuid)
RETURNS TABLE (
  student_id uuid,
  nome text,
  telefone text,
  marco text,
  dias_restantes integer,
  valido_ate date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carencia integer;
BEGIN
  SELECT COALESCE(c.dias_carencia, 3) INTO v_carencia
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;
  v_carencia := COALESCE(v_carencia, 3);

  RETURN QUERY
  SELECT a.student_id,
         pr.name::text,
         pr.phone::text,
         m.marco,
         a.dias_restantes,
         a.valido_ate
    FROM public.acesso_avaliar_academia(p_partner_id) a
    JOIN public.students s  ON s.id = a.student_id
    JOIN public.profiles pr ON pr.id = s.profile_id
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN a.dias_restantes = 3 THEN 'd3'
               WHEN a.dias_restantes = 2 THEN 'd2'
               WHEN a.dias_restantes = 1 THEN 'd1'
               WHEN a.dias_restantes = 0 THEN 'd0'
               -- vespera do bloqueio: depende da carencia da academia,
               -- nunca de um -3 fixo
               WHEN a.dias_restantes = -v_carencia THEN 'ultimo_dia'
             END AS marco
    ) m
   WHERE m.marco IS NOT NULL
     -- a academia pode desligar um marco especifico
     AND COALESCE((
       SELECT mo.ativo FROM public.academia_avisos_modelos mo
        WHERE mo.partner_id = p_partner_id AND mo.marco = m.marco
     ), true)
     AND NOT EXISTS (
       SELECT 1 FROM public.academia_avisos e
        WHERE e.partner_id = p_partner_id
          AND e.student_id = a.student_id
          AND e.valido_ate = a.valido_ate
          AND e.marco = m.marco
     )
   ORDER BY a.dias_restantes DESC, pr.name;
END;
$$;

-- 5. Montagem das campanhas — implementacao unica ---------------------------
-- Usada tanto pelo botao manual quanto pela automacao. Duas implementacoes
-- divergiriam, que foi o problema que a regua ja teve.

CREATE OR REPLACE FUNCTION public.academia_avisos_preparar(p_partner_id uuid)
RETURNS TABLE (marco text, contatos integer, disparo_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_texto text;
  v_disparo uuid;
  v_qtd integer;
  v_hoje text := to_char(now(), 'DD/MM/YYYY');
BEGIN
  FOR r IN
    SELECT p.marco, p.valido_ate, count(*)::integer AS qtd
      FROM public.academia_avisos_pendentes(p_partner_id) p
     WHERE length(trim(COALESCE(p.telefone, ''))) >= 8
     GROUP BY p.marco, p.valido_ate
  LOOP
    SELECT COALESCE(
             (SELECT mo.texto FROM public.academia_avisos_modelos mo
               WHERE mo.partner_id = p_partner_id AND mo.marco = r.marco AND mo.ativo),
             public.academia_aviso_texto_padrao(r.marco)
           )
      INTO v_texto;

    -- {data} sai aqui porque todo alvo deste marco tem o mesmo vencimento.
    -- {nome} fica para o robo resolver por pessoa no envio.
    v_texto := replace(v_texto, '{data}', to_char(r.valido_ate, 'DD/MM/YYYY'));

    INSERT INTO public.bot_disparos (escopo, owner_id, nome, mensagem, uso, status)
    VALUES ('parceiro', p_partner_id,
            'Aviso de vencimento (' || r.marco || ') — ' || v_hoje,
            v_texto, 'plataforma', 'rascunho')
    RETURNING id INTO v_disparo;

    INSERT INTO public.bot_disparo_alvos (disparo_id, telefone, nome)
    SELECT v_disparo, trim(p.telefone), p.nome
      FROM public.academia_avisos_pendentes(p_partner_id) p
     WHERE p.marco = r.marco AND p.valido_ate = r.valido_ate
       AND length(trim(COALESCE(p.telefone, ''))) >= 8
    ON CONFLICT (disparo_id, telefone) DO NOTHING;

    -- Só depois dos alvos: falha antes daqui deixa o aviso pendente para a
    -- próxima rodada em vez de marcar alguém que não entrou em campanha.
    INSERT INTO public.academia_avisos (partner_id, student_id, marco, valido_ate, disparo_id, telefone)
    SELECT p_partner_id, p.student_id, p.marco, p.valido_ate, v_disparo, trim(p.telefone)
      FROM public.academia_avisos_pendentes(p_partner_id) p
     WHERE p.marco = r.marco AND p.valido_ate = r.valido_ate
       AND length(trim(COALESCE(p.telefone, ''))) >= 8
    ON CONFLICT ON CONSTRAINT academia_aviso_unico DO NOTHING;

    v_qtd := r.qtd;
    marco := r.marco; contatos := v_qtd; disparo_id := v_disparo;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 6. Automacao ---------------------------------------------------------------
-- Roda so para academias com avisos_automaticos ligado. Continua apenas
-- MONTANDO rascunhos: nenhuma mensagem sai sem alguem disparar na aba Robo.

CREATE OR REPLACE FUNCTION public.academia_avisos_preparar_automaticos()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_total integer := 0;
BEGIN
  FOR r IN
    SELECT c.partner_id FROM public.partner_acesso_config c WHERE c.avisos_automaticos
  LOOP
    SELECT v_total + COALESCE(sum(x.contatos), 0)
      INTO v_total
      FROM public.academia_avisos_preparar(r.partner_id) x;
  END LOOP;
  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_avisos_pendentes(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_avisos_preparar(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_avisos_preparar_automaticos() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.academia_avisos_pendentes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_avisos_preparar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_avisos_preparar_automaticos() TO service_role;
