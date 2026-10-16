-- Leitura de QR no balcao do parceiro: as duas abas de leitura do painel
-- voltam a funcionar, e para quem de fato fica no balcao.
--
-- DEFEITO 1 - a aba Scanner quebra ao abrir. `partner_freebie_do_dia` declara
-- `status text` no RETURNS TABLE e devolve `r.status`, que e o enum
-- `partner_freebie_reservation_status`. RETURN QUERY nao converte sozinho:
-- 42804 "structure of query does not match function result type", e a tela
-- mostra o toast de erro antes de listar qualquer reserva. Correcao:
-- `r.status::text`. O resto da funcao fica identico.
--
-- DEFEITO 2 - a aba QR so funciona para o dono. As quatro funcoes dela
-- (`partner_preview_student`, `partner_scan_student`, `partner_preview_coupon`,
-- `partner_redeem_coupon`) achavam a unidade por `partners.profile_id =
-- usuario`. Colaborador com 'scanner.usar' - ha 6 hoje, e e quem fica na
-- recepcao - levava "Apenas empresas parceiras podem validar QR de alunos" ou
-- "Acesso negado". `redeem_partner_freebie` ja tinha sido corrigida para membro
-- em 20260819040000; a mesma correcao nunca chegou a esta aba. Medido em
-- 16/10/2026: 0 visitas por scan e 0 reservas usadas nos ultimos 30 dias.
--
-- Decisoes:
--
-- 1. A regra de acesso e a de `redeem_partner_freebie`:
--    partner_pode(unidade, 'scanner.usar') OR dono em partners.profile_id.
--    O EXISTS do dono fica junto de proposito: a mudanca so ALARGA quem
--    consegue, e ninguem que ja conseguia perde.
--
-- 2. Cupom: acha pelo token primeiro e autoriza pela unidade DO CUPOM. Antes a
--    unidade vinha do usuario, num SELECT sem ORDER - e desde 28/07, quando o
--    UNIQUE de partners.profile_id caiu, dono de duas unidades so enxergava os
--    cupons de uma delas. `redeemed_by` passa a ser quem leu, nao o dono: e o
--    dado que responde "quem deu baixa".
--
-- 3. Carteirinha de aluno: o QR nao diz de qual unidade e a visita, entao a
--    tela passa a mandar `_partner_id`. Sem ele (app antigo em cache) so da
--    para decidir quando a pessoa tem UMA unidade aprovada no balcao; com mais
--    de uma a funcao pede para escolher, em vez de gravar a visita na unidade
--    errada - que e o que o LIMIT 1 sem ORDER fazia. Admin fica fora dessa
--    adivinhacao (partner_pode o colocaria em todas as unidades); com a
--    unidade explicita, passa como em partner_pode.
--
-- 4. Trocar a lista de parametros com CREATE OR REPLACE cria uma SOBRECARGA ao
--    lado da velha, e o PostgREST passa a responder "could not choose the best
--    candidate function". Por isso o DROP da assinatura (uuid) antes.
--
-- 5. A escolha e a autorizacao da unidade do aluno moram numa funcao so,
--    `partner_unidade_do_balcao`, chamada pelas duas de aluno. O defeito 2 e
--    justamente uma regra copiada que foi corrigida numa copia e nao na outra.
--
-- 6. Nao mexe no gatilho `trg_partner_coupons_exige_carteirinha` (09/10): cupom
--    de aluno sem carteirinha ativa continua sem virar 'used', agora tambem
--    quando quem le e colaborador. Admin, que partner_pode deixa passar,
--    tambem passa pelo gatilho - como ja passava com UPDATE direto pela policy
--    coupon_admin_all. Nao e acesso novo.
--
-- 7. Grants explicitos nas seis funcoes: authenticated e service_role, sem
--    PUBLIC/anon. Anon nunca passava da checagem de dono, entao nao perde nada.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Aba Scanner: lista do dia (so o cast do enum)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_freebie_do_dia(p_partner_id uuid, p_dia date DEFAULT NULL::date)
 RETURNS TABLE(reservation_id uuid, status text, slot_start timestamp with time zone, slot_end timestamp with time zone, produto text, aluno_nome text, aluno_telefone text, aluno_foto text, coach_nome text, coach_telefone text, visitas_aqui bigint, visitas_no_mes bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_dia date;
BEGIN
  IF NOT public.partner_pode(p_partner_id, 'scanner.usar') THEN
    RAISE EXCEPTION 'Sem acesso a este estabelecimento.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_dia := COALESCE(p_dia, (now() AT TIME ZONE 'America/Cuiaba')::date);

  RETURN QUERY
  SELECT r.id, r.status::text, r.slot_start, r.slot_end,
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
END; $function$;

-- ---------------------------------------------------------------------------
-- 2) De qual unidade e a leitura da carteirinha
-- ---------------------------------------------------------------------------
-- Com `_partner_id`: autoriza nele. Sem ele: a unica unidade aprovada em que a
-- pessoa e dona ou tem 'scanner.usar'. Devolve a unidade ou levanta a mensagem
-- que a tela mostra.
CREATE OR REPLACE FUNCTION public.partner_unidade_do_balcao(_partner_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_partner_status text;
  v_aprovadas uuid[];
  v_vinculos bigint;
BEGIN
  SELECT pr.id INTO v_profile_id FROM public.profiles pr WHERE pr.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;

  IF _partner_id IS NOT NULL THEN
    IF NOT (public.partner_pode(_partner_id, 'scanner.usar')
            OR EXISTS (SELECT 1 FROM public.partners pa
                        WHERE pa.id = _partner_id AND pa.profile_id = v_profile_id)) THEN
      RAISE EXCEPTION 'Apenas empresas parceiras podem validar QR de alunos';
    END IF;
    SELECT pa.status::text INTO v_partner_status FROM public.partners pa WHERE pa.id = _partner_id;
    IF v_partner_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'Empresa parceira ainda não aprovada';
    END IF;
    RETURN _partner_id;
  END IF;

  SELECT array_agg(pa.id) FILTER (WHERE pa.status = 'approved'), count(*)
    INTO v_aprovadas, v_vinculos
    FROM public.partners pa
   WHERE pa.profile_id = v_profile_id
      OR EXISTS (SELECT 1 FROM public.partner_members m
                  WHERE m.partner_id = pa.id
                    AND m.profile_id = v_profile_id
                    AND (m.papel = 'owner' OR 'scanner.usar' = ANY(m.permissoes)));

  IF cardinality(v_aprovadas) = 1 THEN
    RETURN v_aprovadas[1];
  END IF;
  IF cardinality(v_aprovadas) > 1 THEN
    RAISE EXCEPTION 'Escolha a unidade antes de ler o QR';
  END IF;
  -- Dono de unidade ainda pendente recebia esta mensagem antes; continua.
  IF v_vinculos > 0 THEN
    RAISE EXCEPTION 'Empresa parceira ainda não aprovada';
  END IF;
  RAISE EXCEPTION 'Apenas empresas parceiras podem validar QR de alunos';
END;
$function$;

COMMENT ON FUNCTION public.partner_unidade_do_balcao(uuid) IS
  'Unidade em que a leitura de carteirinha vale: a informada, se a pessoa e dona ou tem scanner.usar nela; sem informar, a unica unidade aprovada em que ela e. Levanta a mensagem da tela quando nao da para decidir.';

-- ---------------------------------------------------------------------------
-- 3) Carteirinha: conferir antes de registrar
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.partner_preview_student(uuid);

CREATE OR REPLACE FUNCTION public.partner_preview_student(_student_id uuid, _partner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_id uuid;
  partner_row RECORD;
  student_row RECORD;
BEGIN
  v_partner_id := public.partner_unidade_do_balcao(_partner_id);
  SELECT pa.id, pa.fantasy_name INTO partner_row FROM public.partners pa WHERE pa.id = v_partner_id;

  SELECT s.id, p.name, COALESCE(p.photo_url, p.avatar_url) AS photo, p.email, p.phone, p.city, p.state
  INTO student_row
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.id = _student_id LIMIT 1;
  IF student_row.id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'student_id', student_row.id,
    'student_name', student_row.name,
    'student_avatar', student_row.photo,
    'student_email', student_row.email,
    'student_phone', student_row.phone,
    'student_city', student_row.city,
    'student_state', student_row.state,
    'partner_name', partner_row.fantasy_name
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Carteirinha: registrar a visita
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.partner_scan_student(uuid);

CREATE OR REPLACE FUNCTION public.partner_scan_student(_student_id uuid, _partner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_id uuid;
  partner_row RECORD;
  student_row RECORD;
BEGIN
  v_partner_id := public.partner_unidade_do_balcao(_partner_id);
  SELECT pa.id, pa.fantasy_name INTO partner_row FROM public.partners pa WHERE pa.id = v_partner_id;

  SELECT s.id, p.name, p.avatar_url, p.email
  INTO student_row
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.id = _student_id LIMIT 1;
  IF student_row.id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  INSERT INTO public.partner_visits (partner_id, student_id, source)
  VALUES (partner_row.id, student_row.id, 'partner_scan');

  INSERT INTO public.attendance_logs (student_id, log_date, attended, activity_type, notes)
  VALUES (student_row.id, CURRENT_DATE, true, 'partner_visit', 'Visita à empresa parceira: ' || partner_row.fantasy_name)
  ON CONFLICT (student_id, log_date, activity_type) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'student_id', student_row.id,
    'student_name', student_row.name,
    'student_avatar', student_row.avatar_url,
    'partner_name', partner_row.fantasy_name,
    'visited_at', now()
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5) Cupom: conferir antes de dar baixa
-- ---------------------------------------------------------------------------
-- Toda referencia a coluna vai qualificada: os nomes do RETURNS TABLE (status,
-- created_at, ...) viram variaveis em plpgsql e colidiriam.
CREATE OR REPLACE FUNCTION public.partner_preview_coupon(p_token text)
 RETURNS TABLE(coupon_id uuid, status text, student_name text, student_photo text, product_name text, created_at timestamp with time zone, redeemed_at timestamp with time zone, benefit_start_time time without time zone, benefit_end_time time without time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_coupon_id uuid;
  v_partner_id uuid;
  v_partner_status text;
BEGIN
  SELECT pr.id INTO v_profile_id FROM public.profiles pr WHERE pr.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT pc.id, pc.partner_id INTO v_coupon_id, v_partner_id
    FROM public.partner_coupons pc
   WHERE pc.token = upper(p_token);
  IF v_coupon_id IS NULL THEN
    RAISE EXCEPTION 'Cupom não encontrado';
  END IF;

  IF NOT (public.partner_pode(v_partner_id, 'scanner.usar')
          OR EXISTS (SELECT 1 FROM public.partners pa
                      WHERE pa.id = v_partner_id AND pa.profile_id = v_profile_id)) THEN
    RAISE EXCEPTION 'Este QR não pertence ao seu estabelecimento';
  END IF;

  SELECT pa.status::text INTO v_partner_status FROM public.partners pa WHERE pa.id = v_partner_id;
  IF v_partner_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Empresa parceira ainda não aprovada';
  END IF;

  RETURN QUERY
  SELECT
    pc.id,
    pc.status::text,
    sp.name::text,
    COALESCE(sp.photo_url, sp.avatar_url)::text,
    COALESCE(pc.product_name, pp.name)::text,
    pc.created_at,
    pc.redeemed_at,
    pp.benefit_start_time,
    pp.benefit_end_time
  FROM public.partner_coupons pc
  JOIN public.students s ON s.id = pc.student_id
  JOIN public.profiles sp ON sp.id = s.profile_id
  JOIN public.partner_products pp ON pp.id = pc.partner_product_id
  WHERE pc.id = v_coupon_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) Cupom: dar baixa
-- ---------------------------------------------------------------------------
-- O gatilho trg_partner_coupons_exige_carteirinha continua decidindo se o
-- cupom pode virar 'used' (carteirinha ativa). Nao contornar.
CREATE OR REPLACE FUNCTION public.partner_redeem_coupon(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_coupon_id uuid;
  v_partner_id uuid;
  v_partner_status text;
  v_status text;
  v_start time without time zone;
  v_end time without time zone;
  v_now time without time zone;
  v_allowed boolean := true;
BEGIN
  SELECT pr.id INTO v_profile_id FROM public.profiles pr WHERE pr.user_id = auth.uid() LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT pc.id, pc.partner_id, pc.status::text, pp.benefit_start_time, pp.benefit_end_time
  INTO v_coupon_id, v_partner_id, v_status, v_start, v_end
  FROM public.partner_coupons pc
  JOIN public.partner_products pp ON pp.id = pc.partner_product_id
  WHERE pc.token = upper(p_token)
  FOR UPDATE OF pc;

  IF v_coupon_id IS NULL THEN
    RAISE EXCEPTION 'Cupom não encontrado';
  END IF;

  IF NOT (public.partner_pode(v_partner_id, 'scanner.usar')
          OR EXISTS (SELECT 1 FROM public.partners pa
                      WHERE pa.id = v_partner_id AND pa.profile_id = v_profile_id)) THEN
    RAISE EXCEPTION 'Este QR não pertence ao seu estabelecimento';
  END IF;

  SELECT pa.status::text INTO v_partner_status FROM public.partners pa WHERE pa.id = v_partner_id;
  IF v_partner_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Empresa parceira ainda não aprovada';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Cupom já utilizado ou cancelado';
  END IF;

  v_now := (now() AT TIME ZONE 'America/Cuiaba')::time;

  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    IF v_start <= v_end THEN
      v_allowed := v_now >= v_start AND v_now <= v_end;
    ELSE
      v_allowed := v_now >= v_start OR v_now <= v_end;
    END IF;
  ELSIF v_start IS NOT NULL THEN
    v_allowed := v_now >= v_start;
  ELSIF v_end IS NOT NULL THEN
    v_allowed := v_now <= v_end;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Benefício disponível apenas no horário permitido';
  END IF;

  UPDATE public.partner_coupons
  SET status = 'used',
      redeemed_at = now(),
      redeemed_by = v_profile_id
  WHERE id = v_coupon_id;

  RETURN v_coupon_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7) Quem pode chamar
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.partner_freebie_do_dia(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_freebie_do_dia(uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.partner_unidade_do_balcao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_unidade_do_balcao(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.partner_preview_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_preview_student(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.partner_scan_student(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_scan_student(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.partner_preview_coupon(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_preview_coupon(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.partner_redeem_coupon(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_redeem_coupon(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Conferencia depois de aplicar:
--   SELECT p.oid::regprocedure AS assinatura, md5(p.prosrc) AS md5,
--          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_executa
--     FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace
--      AND p.proname IN ('partner_freebie_do_dia', 'partner_unidade_do_balcao',
--                        'partner_preview_student', 'partner_scan_student',
--                        'partner_preview_coupon', 'partner_redeem_coupon')
--    ORDER BY 1;
--   -- 6 linhas; *_student so com (uuid, uuid); anon_executa = false em todas.
