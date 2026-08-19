-- Membro da academia volta a conseguir resgatar o QR do aluno.
--
-- O DEFEITO: redeem_partner_freebie so aceitava o DONO do parceiro
-- (partners.profile_id) ou admin da plataforma. Quem a academia cadastrava como
-- membro — justamente quem fica na recepcao lendo QR — batia em "Este QR nao
-- pertence ao seu estabelecimento", mesmo vendo a reserva na lista do dia: a
-- listagem respeitava membro, o resgate nao.
--
-- O tamanho do estrago aparece nos numeros: 54 reservas criadas em todos os
-- parceiros e UMA unica usada. Ninguem conseguia dar entrada.
--
-- partner_pode(partner_id, permissao) ja existia e cobre dono, permissao e
-- admin, e ja existia a permissao 'scanner.usar'. O EXISTS do dono fica junto de
-- proposito: a mudanca so ALARGA quem consegue resgatar, e ninguem que ja
-- conseguia perde acesso.
--
-- Junto vem o que a recepcao precisava e a tela nao mostrava: telefone do aluno,
-- coach responsavel com contato, quantas vezes a pessoa ja veio, e o historico
-- do mes com vagas restantes.

-- ===========================================================================
-- 1) O resgate
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.redeem_partner_freebie(_qr_token text)
RETURNS TABLE (reservation_id uuid, student_name text, product_name text,
               slot_start timestamptz, slot_end timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  r public.partner_freebie_reservations%ROWTYPE;
  v_pode boolean;
  v_student_name text;
  v_product_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  SELECT * INTO r FROM public.partner_freebie_reservations
   WHERE qr_token = trim(_qr_token) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR inválido';
  END IF;

  -- Antes isto exigia ser o DONO do parceiro (partners.profile_id) ou admin da
  -- plataforma. Quem a academia cadastrava como membro — justamente quem fica na
  -- recepcao lendo QR — batia em "Este QR nao pertence ao seu estabelecimento",
  -- mesmo vendo a reserva na lista do dia: a listagem respeita membro, o resgate
  -- nao respeitava.
  --
  -- partner_pode() ja existia e cobre dono, permissao e admin. O EXISTS do dono
  -- fica junto de proposito: assim a mudanca so ALARGA quem consegue resgatar, e
  -- ninguem que ja conseguia perde acesso.
  SELECT public.partner_pode(r.partner_id, 'scanner.usar')
         OR EXISTS (SELECT 1 FROM public.partners pa
                     WHERE pa.id = r.partner_id AND pa.profile_id = v_profile_id)
    INTO v_pode;

  IF NOT v_pode THEN
    RAISE EXCEPTION 'Este QR não pertence ao seu estabelecimento';
  END IF;

  IF r.status = 'used' THEN RAISE EXCEPTION 'QR já utilizado'; END IF;
  IF r.status = 'cancelled' THEN RAISE EXCEPTION 'Reserva cancelada'; END IF;
  IF r.status = 'expired' THEN RAISE EXCEPTION 'Produto fora do horário de utilização'; END IF;
  IF r.status <> 'reserved' THEN RAISE EXCEPTION 'Reserva % não pode ser usada', r.status; END IF;

  IF now() < r.slot_start THEN
    RAISE EXCEPTION 'Produto fora do horário de utilização. Libera em %',
      to_char(r.slot_start AT TIME ZONE 'America/Cuiaba', 'DD/MM HH24:MI');
  END IF;

  IF now() > r.slot_end THEN
    UPDATE public.partner_freebie_reservations SET status = 'expired' WHERE id = r.id;
    RAISE EXCEPTION 'Produto fora do horário de utilização';
  END IF;

  UPDATE public.partner_freebie_reservations
     SET status = 'used', used_at = now(), scanned_by_profile_id = v_profile_id
   WHERE id = r.id;

  SELECT pr.name INTO v_student_name FROM public.profiles pr WHERE pr.id = r.profile_id;
  SELECT pp.name INTO v_product_name FROM public.partner_products pp WHERE pp.id = r.partner_product_id;

  RETURN QUERY SELECT r.id, COALESCE(v_student_name, 'Aluno'),
                      COALESCE(v_product_name, 'Produto'), r.slot_start, r.slot_end;
END; $$;

-- ===========================================================================
-- 2) A lista do dia, com o que a recepcao precisa
-- ===========================================================================
-- Quatro juncoes que nao caberiam num SELECT do cliente sem esbarrar em RLS,
-- e a mesma checagem de 'scanner.usar' do resgate.

CREATE OR REPLACE FUNCTION public.partner_freebie_do_dia(
  p_partner_id uuid,
  p_dia date DEFAULT NULL
)
RETURNS TABLE (
  reservation_id uuid, status text, slot_start timestamptz, slot_end timestamptz,
  produto text, aluno_nome text, aluno_telefone text, aluno_foto text,
  coach_nome text, coach_telefone text,
  visitas_aqui bigint, visitas_no_mes bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_dia date;
BEGIN
  IF NOT public.partner_pode(p_partner_id, 'scanner.usar') THEN
    RAISE EXCEPTION 'Sem acesso a este estabelecimento.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_dia := COALESCE(p_dia, (now() AT TIME ZONE 'America/Cuiaba')::date);

  RETURN QUERY
  SELECT r.id, r.status, r.slot_start, r.slot_end,
         COALESCE(pp.name, 'Produto')::text,
         COALESCE(al.name, 'Aluno')::text,
         al.phone::text,
         COALESCE(al.photo_url, al.avatar_url)::text,
         cp.name::text,
         cp.phone::text,
         -- Quantas vezes esta pessoa ja veio A ESTA academia, de fato (usado).
         (SELECT count(*) FROM public.partner_freebie_reservations h
           WHERE h.partner_id = p_partner_id AND h.status = 'used'
             AND h.profile_id = r.profile_id),
         -- E quantas neste mes, que e o que costuma ter limite.
         (SELECT count(*) FROM public.partner_freebie_reservations h
           WHERE h.partner_id = p_partner_id AND h.status = 'used'
             AND h.profile_id = r.profile_id
             AND (h.used_at AT TIME ZONE 'America/Cuiaba')::date
                 >= date_trunc('month', v_dia)::date)
    FROM public.partner_freebie_reservations r
    LEFT JOIN public.partner_products pp ON pp.id = r.partner_product_id
    LEFT JOIN public.profiles al ON al.id = r.profile_id
    LEFT JOIN public.students st ON st.id = r.student_id
    LEFT JOIN public.coaches co ON co.id = st.coach_id
    LEFT JOIN public.profiles cp ON cp.id = co.profile_id
   WHERE r.partner_id = p_partner_id
     AND (r.slot_start AT TIME ZONE 'America/Cuiaba')::date = v_dia
   ORDER BY r.slot_start;
END; $$;

REVOKE EXECUTE ON FUNCTION public.partner_freebie_do_dia(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_freebie_do_dia(uuid, date) TO authenticated, service_role;

-- ===========================================================================
-- 3) Historico do mes
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.partner_freebie_resumo_mensal(
  p_partner_id uuid,
  p_mes date DEFAULT NULL
)
RETURNS TABLE (
  produto_id uuid, produto text,
  limite_mensal integer, usados integer, restantes integer,
  reservas integer, visitantes integer, faltas integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ini date; v_fim date;
BEGIN
  IF NOT public.partner_pode(p_partner_id, 'scanner.usar') THEN
    RAISE EXCEPTION 'Sem acesso a este estabelecimento.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_ini := date_trunc('month', COALESCE(p_mes, (now() AT TIME ZONE 'America/Cuiaba')::date))::date;
  v_fim := (v_ini + interval '1 month')::date;

  RETURN QUERY
  SELECT pp.id, pp.name::text,
         pp.monthly_redeem_limit,
         count(*) FILTER (WHERE r.status = 'used')::integer,
         -- Sem limite cadastrado nao ha "restante": devolve NULL em vez de
         -- inventar um numero que a recepcao leria como vaga de verdade.
         CASE WHEN pp.monthly_redeem_limit IS NULL THEN NULL
              ELSE GREATEST(0, pp.monthly_redeem_limit - count(*) FILTER (WHERE r.status = 'used'))::integer
         END,
         count(*) FILTER (WHERE r.status <> 'cancelled')::integer,
         count(DISTINCT r.profile_id) FILTER (WHERE r.status = 'used')::integer,
         -- Reservou, passou do horario e nao apareceu.
         count(*) FILTER (WHERE r.status = 'expired')::integer
    FROM public.partner_products pp
    LEFT JOIN public.partner_freebie_reservations r
      ON r.partner_product_id = pp.id
     AND r.partner_id = p_partner_id
     AND (r.slot_start AT TIME ZONE 'America/Cuiaba')::date >= v_ini
     AND (r.slot_start AT TIME ZONE 'America/Cuiaba')::date <  v_fim
   WHERE pp.partner_id = p_partner_id AND pp.kind = 'free'
   GROUP BY pp.id, pp.name, pp.monthly_redeem_limit
   ORDER BY pp.name;
END; $$;

REVOKE EXECUTE ON FUNCTION public.partner_freebie_resumo_mensal(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_freebie_resumo_mensal(uuid, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Linha de conferencia:
--   SELECT (prosrc LIKE '%partner_pode%') AS resgate_aceita_membro
--     FROM pg_proc WHERE proname = 'redeem_partner_freebie';
--   SELECT count(*) FROM pg_proc
--    WHERE proname IN ('partner_freebie_do_dia','partner_freebie_resumo_mensal');  -- 2
