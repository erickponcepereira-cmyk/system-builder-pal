-- PDV de estacionamento — fase 2, parte sem dinheiro: operar o pátio.
-- Depende de 20260909120000_pdv_patio_e_tarifa.sql.
--
-- Três funções de operação: listar o pátio, abrir um ticket e olhar o
-- histórico de um carro. Nenhuma cria venda, pagamento ou lançamento
-- financeiro — o valor que aparece aqui é leitura da régua da fase 1.
--
-- O valor é calculado NO BANCO de propósito. Se a tela somasse frações por
-- conta própria, existiriam duas réguas: a que cobra e a que o cliente lê.

-- ─────────────────────────────────────────────────────────────
-- 1) O pátio, com tempo e valor já resolvidos
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pdv_patio(_partner_id uuid)
RETURNS TABLE (
  ticket_id uuid,
  numero text,
  vaga_codigo text,
  vaga_setor text,
  placa text,
  modelo text,
  cor text,
  entrada_em timestamptz,
  minutos integer,
  valor numeric,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.partner_pode(_partner_id, 'pdv.operar') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT t.id, t.numero, vg.codigo, vg.setor, t.placa, ve.modelo, ve.cor,
         t.entrada_em, r.minutos, r.valor, t.status
  FROM public.pdv_tickets t
  JOIN public.pdv_veiculos ve ON ve.id = t.veiculo_id
  LEFT JOIN public.pdv_vagas vg ON vg.id = t.vaga_id
  CROSS JOIN LATERAL public.pdv_valor_tarifa(t.tarifa_snapshot, t.entrada_em, now()) r
  WHERE t.partner_id = _partner_id
    AND t.status IN ('aberto', 'aguardando_pagamento')
  ORDER BY t.entrada_em;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2) Abrir ticket
-- Acha ou cria o veículo e abre o ticket numa chamada só. Duas idas ao
-- servidor deixariam veículo órfão quando a segunda falhasse.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pdv_abrir_ticket(
  _partner_id uuid,
  _placa text,
  _vaga_id uuid DEFAULT NULL,
  _modelo text DEFAULT NULL,
  _cor text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_placa text := public.pdv_normalizar_placa(_placa);
  v_profile uuid;
  v_veiculo uuid;
  v_ticket uuid;
BEGIN
  IF NOT public.partner_pode(_partner_id, 'pdv.operar') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF v_placa IS NULL THEN
    RAISE EXCEPTION 'Placa inválida';
  END IF;

  IF _vaga_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pdv_vagas
    WHERE id = _vaga_id AND partner_id = _partner_id AND ativa
  ) THEN
    RAISE EXCEPTION 'Vaga inválida para esta unidade';
  END IF;

  SELECT p.id INTO v_profile FROM public.profiles p WHERE p.user_id = auth.uid();

  INSERT INTO public.pdv_veiculos (partner_id, placa, modelo, cor)
  VALUES (_partner_id, v_placa, _modelo, _cor)
  ON CONFLICT (partner_id, placa) DO UPDATE
    SET modelo = COALESCE(EXCLUDED.modelo, public.pdv_veiculos.modelo),
        cor = COALESCE(EXCLUDED.cor, public.pdv_veiculos.cor)
  RETURNING id INTO v_veiculo;

  INSERT INTO public.pdv_tickets (
    partner_id, veiculo_id, placa, vaga_id, operador_entrada_profile_id
  )
  VALUES (_partner_id, v_veiculo, v_placa, _vaga_id, v_profile)
  RETURNING id INTO v_ticket;

  RETURN v_ticket;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) Histórico curto do carro — o que a tela de entrada mostra
-- ("3ª vez este mês · última saída 06/09")
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pdv_veiculo_resumo(_partner_id uuid, _placa text)
RETURNS TABLE (
  veiculo_id uuid,
  placa text,
  modelo text,
  cor text,
  cliente_nome text,
  visitas_no_mes integer,
  ultima_saida timestamptz,
  tem_ticket_aberto boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_placa text := public.pdv_normalizar_placa(_placa);
BEGIN
  IF NOT public.partner_pode(_partner_id, 'pdv.operar') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF v_placa IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ve.id, ve.placa, ve.modelo, ve.cor, ve.cliente_nome,
    (SELECT count(*)::integer FROM public.pdv_tickets t
      WHERE t.veiculo_id = ve.id
        AND t.entrada_em >= date_trunc('month', now())),
    (SELECT max(t.saida_em) FROM public.pdv_tickets t WHERE t.veiculo_id = ve.id),
    EXISTS (SELECT 1 FROM public.pdv_tickets t
             WHERE t.veiculo_id = ve.id
               AND t.status IN ('aberto', 'aguardando_pagamento'))
  FROM public.pdv_veiculos ve
  WHERE ve.partner_id = _partner_id AND ve.placa = v_placa;
END;
$$;

REVOKE ALL ON FUNCTION public.pdv_patio(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pdv_abrir_ticket(uuid, text, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pdv_veiculo_resumo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_patio(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_abrir_ticket(uuid, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_veiculo_resumo(uuid, text) TO authenticated, service_role;
