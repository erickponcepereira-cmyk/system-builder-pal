-- PDV de estacionamento — fase 1: o pátio no banco.
-- Vagas, tarifas, veículos e tickets, mais a régua de cálculo.
-- Nada aqui toca em dinheiro: não cria venda, não credita carteira.
-- Desenho e decisões em docs/PDV-ESTACIONAMENTO.md.

-- ─────────────────────────────────────────────────────────────
-- 1) Vagas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.pdv_vagas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  setor text,
  tipo text NOT NULL DEFAULT 'comum'
    CHECK (tipo IN ('comum','coberta','moto','pcd','idoso','eletrico')),
  ativa boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, codigo)
);
CREATE INDEX idx_pdv_vagas_partner ON public.pdv_vagas(partner_id, ativa, ordem);

-- ─────────────────────────────────────────────────────────────
-- 2) Tarifas
-- Régua nova é LINHA nova com vigente_desde, nunca UPDATE — mesma
-- disciplina de taxas_vigentes. O passado fica intacto por construção.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.pdv_tarifas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  nome text NOT NULL,
  regra text NOT NULL DEFAULT 'tempo' CHECK (regra IN ('tempo','fixo')),
  tolerancia_min integer NOT NULL DEFAULT 0 CHECK (tolerancia_min >= 0),
  primeira_fracao_min integer NOT NULL DEFAULT 60 CHECK (primeira_fracao_min > 0),
  primeira_fracao_valor numeric(12,2) NOT NULL DEFAULT 0 CHECK (primeira_fracao_valor >= 0),
  fracao_adicional_min integer NOT NULL DEFAULT 30 CHECK (fracao_adicional_min > 0),
  fracao_adicional_valor numeric(12,2) NOT NULL DEFAULT 0 CHECK (fracao_adicional_valor >= 0),
  teto_periodo_valor numeric(12,2) CHECK (teto_periodo_valor IS NULL OR teto_periodo_valor >= 0),
  valor_fixo numeric(12,2) CHECK (valor_fixo IS NULL OR valor_fixo >= 0),
  dias_semana smallint[],
  hora_inicio time,
  hora_fim time,
  vigente_desde date NOT NULL DEFAULT CURRENT_DATE,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_tarifas_fixo_exige_valor
    CHECK (regra <> 'fixo' OR valor_fixo IS NOT NULL),
  CONSTRAINT pdv_tarifas_faixa_completa
    CHECK ((hora_inicio IS NULL) = (hora_fim IS NULL))
);
CREATE INDEX idx_pdv_tarifas_partner ON public.pdv_tarifas(partner_id, ativa, vigente_desde DESC);

-- ─────────────────────────────────────────────────────────────
-- 3) Veículos — a placa é a chave operacional do rotativo
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.pdv_veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  placa text NOT NULL,
  modelo text,
  cor text,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  cliente_nome text,
  cliente_telefone text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, placa)
);
CREATE INDEX idx_pdv_veiculos_student ON public.pdv_veiculos(student_id) WHERE student_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4) Tickets
-- ─────────────────────────────────────────────────────────────
CREATE SEQUENCE public.pdv_ticket_numero_seq;

CREATE TABLE public.pdv_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  numero text NOT NULL UNIQUE,
  veiculo_id uuid NOT NULL REFERENCES public.pdv_veiculos(id) ON DELETE RESTRICT,
  placa text NOT NULL,
  vaga_id uuid REFERENCES public.pdv_vagas(id) ON DELETE SET NULL,
  entrada_em timestamptz NOT NULL DEFAULT now(),
  saida_em timestamptz,
  fechado_em timestamptz,
  tarifa_id uuid REFERENCES public.pdv_tarifas(id) ON DELETE SET NULL,
  tarifa_snapshot jsonb NOT NULL,
  minutos_permanencia integer,
  valor_calculado numeric(12,2),
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto','aguardando_pagamento','pago','cortesia','cancelado')),
  cortesia_motivo text,
  autorizado_por_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  operador_entrada_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  operador_saida_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  comprovante_impresso_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_tickets_saida_depois_da_entrada
    CHECK (saida_em IS NULL OR saida_em >= entrada_em),
  CONSTRAINT pdv_tickets_cortesia_exige_motivo
    CHECK (status <> 'cortesia' OR cortesia_motivo IS NOT NULL)
);

CREATE INDEX idx_pdv_tickets_patio ON public.pdv_tickets(partner_id, status, entrada_em);
CREATE INDEX idx_pdv_tickets_placa ON public.pdv_tickets(partner_id, placa, entrada_em DESC);
CREATE INDEX idx_pdv_tickets_veiculo ON public.pdv_tickets(veiculo_id, entrada_em DESC);

-- Duas invariantes de pátio, no banco e não na tela:
-- o mesmo carro não tem dois tickets abertos, e uma vaga não recebe dois carros.
CREATE UNIQUE INDEX uq_pdv_tickets_placa_aberta
  ON public.pdv_tickets(partner_id, placa)
  WHERE status IN ('aberto','aguardando_pagamento');
CREATE UNIQUE INDEX uq_pdv_tickets_vaga_ocupada
  ON public.pdv_tickets(partner_id, vaga_id)
  WHERE vaga_id IS NOT NULL AND status IN ('aberto','aguardando_pagamento');

-- ─────────────────────────────────────────────────────────────
-- 5) Placa: normalização única, usada por tabela e por busca
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pdv_normalizar_placa(_placa text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(upper(regexp_replace(COALESCE(_placa, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

-- ─────────────────────────────────────────────────────────────
-- 6) Fuso do parceiro
-- O banco é UTC; o pátio não. Faixa de horário e dia da semana são
-- avaliados no fuso do parceiro. A fonte hoje é partner_acesso_config;
-- fica encapsulado aqui para que trocar a fonte seja mexer num lugar só.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pdv_timezone(_partner_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT c.timezone FROM public.partner_acesso_config c WHERE c.partner_id = _partner_id),
    'America/Sao_Paulo'
  )
$$;

-- ─────────────────────────────────────────────────────────────
-- 7) Qual tarifa vale neste momento
-- Mais específica ganha: faixa de horário definida vence a genérica;
-- entre iguais, a mais recente.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pdv_tarifa_para(_partner_id uuid, _momento timestamptz DEFAULT now())
RETURNS public.pdv_tarifas
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tz text := public.pdv_timezone(_partner_id);
  v_local timestamp := _momento AT TIME ZONE v_tz;
  v_tarifa public.pdv_tarifas;
BEGIN
  SELECT t.* INTO v_tarifa
  FROM public.pdv_tarifas t
  WHERE t.partner_id = _partner_id
    AND t.ativa
    AND t.vigente_desde <= v_local::date
    AND (t.dias_semana IS NULL OR EXTRACT(DOW FROM v_local)::smallint = ANY(t.dias_semana))
    AND (
      t.hora_inicio IS NULL
      OR (t.hora_inicio <= t.hora_fim AND v_local::time BETWEEN t.hora_inicio AND t.hora_fim)
      OR (t.hora_inicio > t.hora_fim AND (v_local::time >= t.hora_inicio OR v_local::time <= t.hora_fim))
    )
  ORDER BY (t.hora_inicio IS NOT NULL) DESC, (t.dias_semana IS NOT NULL) DESC, t.vigente_desde DESC, t.created_at DESC
  LIMIT 1;

  RETURN v_tarifa;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8) A régua, pura e testável
-- Recebe o snapshot congelado no ticket. Não lê tabela — é aqui que os
-- casos de borda são provados, sem precisar montar cenário no banco.
--
-- Regras:
--  · até a tolerância, não cobra — comparação por <=, e a tolerância vale
--    para o ticket inteiro, não para a sobra do último dia;
--  · fração começada é fração cobrada;
--  · o teto limita CADA período de 24h, e o resto do último período;
--  · permanência negativa (relógio errado) vira zero, nunca valor negativo.
-- ─────────────────────────────────────────────────────────────
-- Primeira fração + frações começadas. Fração de zero minuto não cobra nada;
-- qualquer minuto acima disso já paga a primeira fração inteira.
CREATE OR REPLACE FUNCTION public.pdv_valor_fracoes(
  _minutos integer,
  _primeira_min integer,
  _primeira_valor numeric,
  _fracao_min integer,
  _fracao_valor numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _minutos <= 0 THEN 0::numeric
    WHEN _minutos <= _primeira_min THEN _primeira_valor
    ELSE _primeira_valor
       + CEIL((_minutos - _primeira_min)::numeric / _fracao_min) * _fracao_valor
  END
$$;

CREATE OR REPLACE FUNCTION public.pdv_valor_tarifa(
  _snapshot jsonb,
  _entrada timestamptz,
  _momento timestamptz DEFAULT now()
)
RETURNS TABLE (minutos integer, valor numeric, detalhe jsonb)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_min integer;
  v_regra text := COALESCE(_snapshot->>'regra', 'tempo');
  v_tolerancia integer := COALESCE((_snapshot->>'tolerancia_min')::integer, 0);
  v_p_min integer := COALESCE((_snapshot->>'primeira_fracao_min')::integer, 60);
  v_p_val numeric := COALESCE((_snapshot->>'primeira_fracao_valor')::numeric, 0);
  v_f_min integer := COALESCE((_snapshot->>'fracao_adicional_min')::integer, 30);
  v_f_val numeric := COALESCE((_snapshot->>'fracao_adicional_valor')::numeric, 0);
  v_teto numeric := NULLIF(_snapshot->>'teto_periodo_valor', '')::numeric;
  v_fixo numeric := COALESCE(NULLIF(_snapshot->>'valor_fixo', '')::numeric, 0);
  v_dias integer;
  v_resto integer;
  v_valor_dia numeric;
  v_valor_resto numeric;
  v_valor numeric;
BEGIN
  v_min := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (_momento - _entrada)) / 60.0)::integer);

  IF v_min <= v_tolerancia THEN
    RETURN QUERY SELECT v_min, 0::numeric,
      jsonb_build_object('regra', v_regra, 'minutos', v_min, 'motivo', 'tolerancia');
    RETURN;
  END IF;

  IF v_regra = 'fixo' THEN
    RETURN QUERY SELECT v_min, round(v_fixo, 2),
      jsonb_build_object('regra', 'fixo', 'minutos', v_min);
    RETURN;
  END IF;

  v_dias := v_min / 1440;
  v_resto := v_min - (v_dias * 1440);

  v_valor_dia := public.pdv_valor_fracoes(1440, v_p_min, v_p_val, v_f_min, v_f_val);
  v_valor_resto := public.pdv_valor_fracoes(v_resto, v_p_min, v_p_val, v_f_min, v_f_val);

  IF v_teto IS NOT NULL THEN
    v_valor_dia := LEAST(v_valor_dia, v_teto);
    v_valor_resto := LEAST(v_valor_resto, v_teto);
  END IF;

  v_valor := (v_dias * v_valor_dia) + v_valor_resto;

  RETURN QUERY SELECT v_min, round(v_valor, 2), jsonb_build_object(
    'regra', 'tempo',
    'minutos', v_min,
    'dias_completos', v_dias,
    'minutos_restantes', v_resto,
    'valor_por_dia', round(v_valor_dia, 2),
    'valor_resto', round(v_valor_resto, 2),
    'teto_aplicado', v_teto IS NOT NULL
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9) Cálculo do ticket
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pdv_calcular_tarifa(
  _ticket_id uuid,
  _momento timestamptz DEFAULT now()
)
RETURNS TABLE (minutos integer, valor numeric, detalhe jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket public.pdv_tickets;
BEGIN
  SELECT t.* INTO v_ticket FROM public.pdv_tickets t WHERE t.id = _ticket_id;
  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'Ticket não encontrado';
  END IF;
  IF NOT public.partner_pode(v_ticket.partner_id, 'pdv.operar') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT r.minutos, r.valor, r.detalhe
  FROM public.pdv_valor_tarifa(
    v_ticket.tarifa_snapshot,
    v_ticket.entrada_em,
    COALESCE(v_ticket.saida_em, _momento)
  ) r;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 10) Gatilhos
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pdv_veiculos_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.placa := public.pdv_normalizar_placa(NEW.placa);
  IF NEW.placa IS NULL THEN
    RAISE EXCEPTION 'Placa inválida';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdv_veiculos_before_write
  BEFORE INSERT OR UPDATE ON public.pdv_veiculos
  FOR EACH ROW EXECUTE FUNCTION public.pdv_veiculos_before_write();

-- Ticket nunca nasce sem número e sem tarifa congelada. A garantia é aqui,
-- não em quem insere: uma tela que esqueça o snapshot criaria um ticket que
-- muda de preço quando o parceiro edita a tabela, e isso só apareceria na
-- reclamação do cliente.
CREATE OR REPLACE FUNCTION public.pdv_tickets_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_tarifa public.pdv_tarifas;
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := 'T-' || lpad(nextval('public.pdv_ticket_numero_seq')::text, 6, '0');
  END IF;

  NEW.placa := COALESCE(
    public.pdv_normalizar_placa(NEW.placa),
    (SELECT v.placa FROM public.pdv_veiculos v WHERE v.id = NEW.veiculo_id)
  );
  IF NEW.placa IS NULL THEN
    RAISE EXCEPTION 'Placa inválida';
  END IF;

  IF NEW.tarifa_id IS NULL THEN
    v_tarifa := public.pdv_tarifa_para(NEW.partner_id, NEW.entrada_em);
    IF v_tarifa.id IS NULL THEN
      RAISE EXCEPTION 'Nenhuma tarifa vigente para este parceiro';
    END IF;
    NEW.tarifa_id := v_tarifa.id;
  ELSE
    SELECT t.* INTO v_tarifa FROM public.pdv_tarifas t WHERE t.id = NEW.tarifa_id;
    IF v_tarifa.id IS NULL OR v_tarifa.partner_id <> NEW.partner_id THEN
      RAISE EXCEPTION 'Tarifa inválida para este parceiro';
    END IF;
  END IF;

  NEW.tarifa_snapshot := jsonb_build_object(
    'tarifa_id', v_tarifa.id,
    'nome', v_tarifa.nome,
    'regra', v_tarifa.regra,
    'tolerancia_min', v_tarifa.tolerancia_min,
    'primeira_fracao_min', v_tarifa.primeira_fracao_min,
    'primeira_fracao_valor', v_tarifa.primeira_fracao_valor,
    'fracao_adicional_min', v_tarifa.fracao_adicional_min,
    'fracao_adicional_valor', v_tarifa.fracao_adicional_valor,
    'teto_periodo_valor', v_tarifa.teto_periodo_valor,
    'valor_fixo', v_tarifa.valor_fixo,
    'congelado_em', NEW.entrada_em
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdv_tickets_before_insert
  BEFORE INSERT ON public.pdv_tickets
  FOR EACH ROW EXECUTE FUNCTION public.pdv_tickets_before_insert();

-- Relógio de dispositivo erra, e já errou neste projeto: o iDFace chegou com
-- quatro horas de atraso. Se a saída vier antes da entrada, vale a entrada —
-- o ticket fecha com zero minuto. A alternativa seria o CHECK barrar o UPDATE,
-- e aí o carro não sai do pátio até alguém mexer no banco.
CREATE OR REPLACE FUNCTION public.pdv_tickets_saida_coerente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.saida_em IS NOT NULL AND NEW.saida_em < NEW.entrada_em THEN
    NEW.saida_em := NEW.entrada_em;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pdv_tickets_saida_coerente
  BEFORE INSERT OR UPDATE ON public.pdv_tickets
  FOR EACH ROW EXECUTE FUNCTION public.pdv_tickets_saida_coerente();

CREATE TRIGGER trg_pdv_vagas_updated_at BEFORE UPDATE ON public.pdv_vagas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pdv_tarifas_updated_at BEFORE UPDATE ON public.pdv_tarifas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pdv_veiculos_updated_at BEFORE UPDATE ON public.pdv_veiculos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pdv_tickets_updated_at BEFORE UPDATE ON public.pdv_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 11) RLS — sempre com TO explícito.
-- Quem opera é membro do parceiro com permissão 'pdv'; partner_pode já
-- contempla o dono e o admin. Placa e telefone são dado pessoal: colaborador
-- de outra área do mesmo parceiro não precisa ver o pátio.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.pdv_vagas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_tarifas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_tickets ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_vagas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_tarifas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_veiculos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdv_tickets TO authenticated;
GRANT ALL ON public.pdv_vagas TO service_role;
GRANT ALL ON public.pdv_tarifas TO service_role;
GRANT ALL ON public.pdv_veiculos TO service_role;
GRANT ALL ON public.pdv_tickets TO service_role;
GRANT USAGE ON SEQUENCE public.pdv_ticket_numero_seq TO authenticated, service_role;

CREATE POLICY "pdv_vagas_select" ON public.pdv_vagas FOR SELECT TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.operar') OR public.partner_pode(partner_id, 'pdv.configurar'));
CREATE POLICY "pdv_vagas_insert" ON public.pdv_vagas FOR INSERT TO authenticated
  WITH CHECK (public.partner_pode(partner_id, 'pdv.configurar'));
CREATE POLICY "pdv_vagas_update" ON public.pdv_vagas FOR UPDATE TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.configurar'))
  WITH CHECK (public.partner_pode(partner_id, 'pdv.configurar'));
CREATE POLICY "pdv_vagas_delete" ON public.pdv_vagas FOR DELETE TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.configurar'));

CREATE POLICY "pdv_tarifas_select" ON public.pdv_tarifas FOR SELECT TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.operar') OR public.partner_pode(partner_id, 'pdv.configurar'));
CREATE POLICY "pdv_tarifas_insert" ON public.pdv_tarifas FOR INSERT TO authenticated
  WITH CHECK (public.partner_pode(partner_id, 'pdv.configurar'));
CREATE POLICY "pdv_tarifas_update" ON public.pdv_tarifas FOR UPDATE TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.configurar'))
  WITH CHECK (public.partner_pode(partner_id, 'pdv.configurar'));
CREATE POLICY "pdv_tarifas_delete" ON public.pdv_tarifas FOR DELETE TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.configurar'));

CREATE POLICY "pdv_veiculos_select" ON public.pdv_veiculos FOR SELECT TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.operar'));
CREATE POLICY "pdv_veiculos_insert" ON public.pdv_veiculos FOR INSERT TO authenticated
  WITH CHECK (public.partner_pode(partner_id, 'pdv.operar'));
CREATE POLICY "pdv_veiculos_update" ON public.pdv_veiculos FOR UPDATE TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.operar'))
  WITH CHECK (public.partner_pode(partner_id, 'pdv.operar'));
CREATE POLICY "pdv_veiculos_delete" ON public.pdv_veiculos FOR DELETE TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.operar'));

CREATE POLICY "pdv_tickets_select" ON public.pdv_tickets FOR SELECT TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.operar'));
CREATE POLICY "pdv_tickets_insert" ON public.pdv_tickets FOR INSERT TO authenticated
  WITH CHECK (public.partner_pode(partner_id, 'pdv.operar'));
CREATE POLICY "pdv_tickets_update" ON public.pdv_tickets FOR UPDATE TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.operar'))
  WITH CHECK (public.partner_pode(partner_id, 'pdv.operar'));
CREATE POLICY "pdv_tickets_delete" ON public.pdv_tickets FOR DELETE TO authenticated
  USING (public.partner_pode(partner_id, 'pdv.operar'));

REVOKE ALL ON FUNCTION public.pdv_timezone(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pdv_tarifa_para(uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pdv_calcular_tarifa(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_timezone(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_tarifa_para(uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_calcular_tarifa(uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_normalizar_placa(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_valor_fracoes(integer, integer, numeric, integer, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_valor_tarifa(jsonb, timestamptz, timestamptz) TO authenticated, service_role;
