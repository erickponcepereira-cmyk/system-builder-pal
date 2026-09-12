-- Verificação da fase 1 do PDV (20260909120000_pdv_patio_e_tarifa.sql).
-- Rodar DEPOIS de aplicar a migration. Falha = RAISE EXCEPTION, então
-- "rodou até o fim sem erro" é o sinal de aprovado.
--
-- Parte A é pura: não lê nem escreve dado de ninguém, pode rodar em produção.
-- Parte B cria e desfaz dados dentro de uma transação com ROLLBACK, e precisa
-- de um partner_id de teste — a bancada '094db4de…' serve.

-- ═══════════════════════════════════════════════════════════════
-- PARTE A — a régua e as policies (seguro em produção)
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  T jsonb := jsonb_build_object(
    'regra','tempo','tolerancia_min',15,
    'primeira_fracao_min',60,'primeira_fracao_valor',10,
    'fracao_adicional_min',30,'fracao_adicional_valor',3,
    'teto_periodo_valor',30);
  SEM_TETO jsonb := jsonb_build_object(
    'regra','tempo','tolerancia_min',15,
    'primeira_fracao_min',60,'primeira_fracao_valor',10,
    'fracao_adicional_min',30,'fracao_adicional_valor',3);
  FIXO jsonb := jsonb_build_object('regra','fixo','tolerancia_min',15,'valor_fixo',8);
  e timestamptz := '2026-09-09 09:00:00-03';
  v numeric;
  m integer;
  c_nome text;
BEGIN
  FOR c_nome, m, v IN
    SELECT c.nome, c.mins, r.valor
    FROM (VALUES
      ('tolerancia exata',         T,          15,   0::numeric),
      ('1 min apos a tolerancia',  T,          16,  10),
      ('primeira fracao exata',    T,          60,  10),
      ('61 min = 1a + 1 fracao',   T,          61,  13),
      ('90 min = 1a + 1 fracao',   T,          90,  13),
      ('91 min = 1a + 2 fracoes',  T,          91,  16),
      ('24h sem teto',             SEM_TETO, 1440, 148),
      ('24h com teto 30',          T,        1440,  30),
      ('3 dias + 10 min',          T,        4330, 100),
      ('3 dias exatos',            T,        4320,  90),
      ('regra fixa, 5h',           FIXO,      300,   8),
      ('regra fixa na tolerancia', FIXO,       10,   0),
      ('zero minutos',             T,           0,   0)
    ) AS c(nome, snap, mins, esperado),
    LATERAL public.pdv_valor_tarifa(c.snap, e, e + make_interval(mins => c.mins)) r
    WHERE r.valor <> c.esperado
  LOOP
    RAISE EXCEPTION 'Regua errada em "%" (% min): devolveu %', c_nome, m, v;
  END LOOP;

  -- relógio invertido nunca gera valor negativo
  SELECT r.minutos, r.valor INTO m, v
  FROM public.pdv_valor_tarifa(T, e, e - interval '90 minutes') r;
  IF m <> 0 OR v <> 0 THEN
    RAISE EXCEPTION 'Saida antes da entrada devolveu % min / R$ %', m, v;
  END IF;

  -- normalização de placa: os dois formatos e o lixo do teclado
  IF public.pdv_normalizar_placa('abc-1d23') <> 'ABC1D23'
     OR public.pdv_normalizar_placa(' abc 1234 ') <> 'ABC1234'
     OR public.pdv_normalizar_placa('---') IS NOT NULL THEN
    RAISE EXCEPTION 'Normalizacao de placa incorreta';
  END IF;

  RAISE NOTICE 'Parte A: regua e placa OK';
END $$;

-- Toda policy precisa de TO explícito. Sem ele o Postgres aplica a PUBLIC,
-- incluindo anon — a regra que derrubou o login dos parceiros em 22/08.
DO $$
DECLARE v_falhas int;
BEGIN
  SELECT count(*) INTO v_falhas
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('pdv_vagas','pdv_tarifas','pdv_veiculos','pdv_tickets')
    AND (roles IS NULL OR roles = '{public}');
  IF v_falhas > 0 THEN
    RAISE EXCEPTION '% policy(s) do PDV sem TO explicito', v_falhas;
  END IF;

  SELECT count(*) INTO v_falhas
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('pdv_vagas','pdv_tarifas','pdv_veiculos','pdv_tickets');
  IF v_falhas <> 16 THEN
    RAISE EXCEPTION 'Esperava 16 policies no PDV, encontrei %', v_falhas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('pdv_vagas','pdv_tarifas','pdv_veiculos','pdv_tickets')
      AND NOT rowsecurity
  ) THEN
    RAISE EXCEPTION 'Alguma tabela do PDV esta sem RLS habilitada';
  END IF;

  RAISE NOTICE 'Parte A: RLS e policies OK';
END $$;

-- ═══════════════════════════════════════════════════════════════
-- PARTE B — pátio de verdade, desfeito no fim
-- Troque o partner_id pelo da bancada de teste antes de rodar.
-- ═══════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_partner uuid := '094db4de-0000-0000-0000-000000000000';  -- <<< TROCAR
  v_tz text;
  v_tarifa_dia uuid;
  v_tarifa_noite uuid;
  v_veiculo uuid;
  v_vaga uuid;
  v_ticket uuid;
  v_escolhida uuid;
  v_valor numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.partners WHERE id = v_partner) THEN
    RAISE EXCEPTION 'Troque v_partner por um parceiro real de teste antes de rodar a Parte B';
  END IF;

  -- fuso do parceiro: o teste depende de America/Cuiaba (-04)
  INSERT INTO public.partner_acesso_config (partner_id, timezone)
  VALUES (v_partner, 'America/Cuiaba')
  ON CONFLICT (partner_id) DO UPDATE SET timezone = 'America/Cuiaba';
  v_tz := public.pdv_timezone(v_partner);
  IF v_tz <> 'America/Cuiaba' THEN
    RAISE EXCEPTION 'pdv_timezone devolveu %', v_tz;
  END IF;

  INSERT INTO public.pdv_tarifas (partner_id, nome, regra, tolerancia_min,
    primeira_fracao_min, primeira_fracao_valor, fracao_adicional_min,
    fracao_adicional_valor, teto_periodo_valor)
  VALUES (v_partner, 'Rotativo dia', 'tempo', 15, 60, 10, 30, 3, 30)
  RETURNING id INTO v_tarifa_dia;

  INSERT INTO public.pdv_tarifas (partner_id, nome, regra, tolerancia_min,
    primeira_fracao_min, primeira_fracao_valor, fracao_adicional_min,
    fracao_adicional_valor, hora_inicio, hora_fim)
  VALUES (v_partner, 'Noturno', 'tempo', 0, 60, 20, 60, 20, '22:00', '06:00')
  RETURNING id INTO v_tarifa_noite;

  -- 01:30 UTC = 21:30 em Cuiabá → ainda é dia, tarifa comum
  v_escolhida := (public.pdv_tarifa_para(v_partner, '2026-09-10 01:30:00+00')).id;
  IF v_escolhida <> v_tarifa_dia THEN
    RAISE EXCEPTION 'Fuso: 21:30 local pegou a tarifa errada';
  END IF;

  -- 03:00 UTC = 23:00 em Cuiabá → faixa noturna, que cruza a meia-noite
  v_escolhida := (public.pdv_tarifa_para(v_partner, '2026-09-10 03:00:00+00')).id;
  IF v_escolhida <> v_tarifa_noite THEN
    RAISE EXCEPTION 'Fuso: 23:00 local nao pegou a tarifa noturna';
  END IF;

  -- 08:00 UTC = 04:00 em Cuiabá → ainda dentro da faixa noturna
  v_escolhida := (public.pdv_tarifa_para(v_partner, '2026-09-10 08:00:00+00')).id;
  IF v_escolhida <> v_tarifa_noite THEN
    RAISE EXCEPTION 'Fuso: 04:00 local saiu da faixa que cruza meia-noite';
  END IF;

  INSERT INTO public.pdv_vagas (partner_id, codigo) VALUES (v_partner, 'A03')
  RETURNING id INTO v_vaga;

  INSERT INTO public.pdv_veiculos (partner_id, placa, modelo)
  VALUES (v_partner, 'abc-1d23', 'Gol')
  RETURNING id INTO v_veiculo;

  IF (SELECT placa FROM public.pdv_veiculos WHERE id = v_veiculo) <> 'ABC1D23' THEN
    RAISE EXCEPTION 'Gatilho nao normalizou a placa do veiculo';
  END IF;

  -- ticket sem tarifa_id: o gatilho resolve e congela
  INSERT INTO public.pdv_tickets (partner_id, veiculo_id, placa, vaga_id, entrada_em)
  VALUES (v_partner, v_veiculo, 'abc-1d23', v_vaga, now() - interval '91 minutes')
  RETURNING id INTO v_ticket;

  IF (SELECT numero FROM public.pdv_tickets WHERE id = v_ticket) IS NULL
     OR (SELECT tarifa_snapshot FROM public.pdv_tickets WHERE id = v_ticket) IS NULL THEN
    RAISE EXCEPTION 'Ticket nasceu sem numero ou sem snapshot';
  END IF;

  SELECT valor INTO v_valor FROM public.pdv_calcular_tarifa(v_ticket);
  IF v_valor <> 16 THEN
    RAISE EXCEPTION '91 minutos deveriam custar 16, devolveu %', v_valor;
  END IF;

  -- tarifa muda depois da entrada: o ticket antigo não pode mudar de preço
  UPDATE public.pdv_tarifas
     SET primeira_fracao_valor = 99, fracao_adicional_valor = 99
   WHERE id = v_tarifa_dia;
  SELECT valor INTO v_valor FROM public.pdv_calcular_tarifa(v_ticket);
  IF v_valor <> 16 THEN
    RAISE EXCEPTION 'Snapshot nao congelou: apos mudar a tarifa devolveu %', v_valor;
  END IF;

  -- mesma placa não abre dois tickets
  BEGIN
    INSERT INTO public.pdv_tickets (partner_id, veiculo_id, placa)
    VALUES (v_partner, v_veiculo, 'ABC1D23');
    RAISE EXCEPTION 'Deixou abrir dois tickets para a mesma placa';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- mesma vaga não recebe dois carros
  DECLARE v_outro uuid;
  BEGIN
    INSERT INTO public.pdv_veiculos (partner_id, placa) VALUES (v_partner, 'XYZ9K88')
    RETURNING id INTO v_outro;
    BEGIN
      INSERT INTO public.pdv_tickets (partner_id, veiculo_id, placa, vaga_id)
      VALUES (v_partner, v_outro, 'XYZ9K88', v_vaga);
      RAISE EXCEPTION 'Deixou dois carros na mesma vaga';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END;

  -- fechado o ticket, a vaga e a placa liberam
  UPDATE public.pdv_tickets SET status = 'pago', saida_em = now(), fechado_em = now()
   WHERE id = v_ticket;
  INSERT INTO public.pdv_tickets (partner_id, veiculo_id, placa, vaga_id)
  VALUES (v_partner, v_veiculo, 'ABC1D23', v_vaga)
  RETURNING id INTO v_ticket;

  -- relógio do dispositivo errado: fechar com saída anterior à entrada não pode
  -- explodir no CHECK e prender o carro no pátio
  UPDATE public.pdv_tickets
     SET saida_em = entrada_em - interval '4 hours', status = 'pago', fechado_em = now()
   WHERE id = v_ticket;
  IF (SELECT saida_em FROM public.pdv_tickets WHERE id = v_ticket)
     <> (SELECT entrada_em FROM public.pdv_tickets WHERE id = v_ticket) THEN
    RAISE EXCEPTION 'Saida anterior a entrada nao foi normalizada';
  END IF;

  RAISE NOTICE 'Parte B: fuso, snapshot, invariantes e relogio OK';
END $$;

ROLLBACK;

-- ═══════════════════════════════════════════════════════════════
-- PARTE C — RLS com dois parceiros. Manual, pelo app.
-- 1. Entrar como membro do parceiro A com permissão 'pdv.operar'
--    → vê o pátio de A, não vê nenhum ticket de B.
-- 2. Entrar como membro de A SEM 'pdv.operar' nem 'pdv.configurar'
--    e que não seja owner → não vê nada do PDV.
-- 3. Entrar como operador ('pdv.operar', sem 'pdv.configurar')
--    → lê a tabela de tarifas, mas UPDATE em pdv_tarifas é negado.
-- Política que devolve vazio NÃO dá erro: confira o que aparece na tela,
-- não só se a consulta falhou.
-- ═══════════════════════════════════════════════════════════════
