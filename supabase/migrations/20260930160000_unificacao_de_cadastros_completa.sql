-- Unificação de cadastros: só admin, e sem deixar nada para trás.
--
-- Levantado ao unificar as duas contas da Lorayny (30/09/2026), que precisou de
-- complemento à mão (ver `admin_audit_log` 'merge_profiles_complemento').
--
-- 0) SEGURANÇA. A função é SECURITY DEFINER, estava liberada para
--    `authenticated` e não conferia quem chamava: qualquer usuário logado podia
--    unificar a conta de outra pessoa na própria e levar comissões, alunos e
--    empresa. Agora só admin (ou o servidor, que já confere admin antes), o
--    responsável precisa ser admin, e o EXECUTE sai de `authenticated`.
--
-- 1) Alunos do coach da origem ficavam na origem. O laço de ligações pulava as
--    tabelas `students`, `coaches` e `profiles` inteiras, então
--    `students.coach_id`, `coaches.upline_coach_id` e afins nunca mudavam. Agora
--    entram, sem religar as próprias linhas de aluno/coach/perfil das duas contas.
--
-- 2) Dono de empresa parceira travava tudo. `guard_partner_members_owner` só
--    deixa trocar o dono com `is_admin(auth.uid())`, e pela tela o auth.uid() é
--    nulo (o servidor chama com service role). A função assume o JWT do
--    administrador responsável durante a unificação.
--
-- 3) Conflito pulava a tabela inteira. Agora move linha a linha o que couber e
--    só o que conflita fica na origem.
--
-- 4) Sobravam duplicados: o coach da origem continuava ativo na equipe do
--    upline, e o aluno da origem na lista do coach. O coach vazio é bloqueado;
--    o aluno vazio, com carteira zerada, é removido.
--
-- 5) A mensalidade da origem continuava cobrando. Se o destino tem a dele, a
--    da origem é cancelada com as faturas em aberto; se não tem, passa para ele.
--
-- 6) O login da origem continuava abrindo a conta vazia. Provedores externos
--    (Apple, Google) passam para o destino, as sessões da origem são
--    encerradas, e o que restar (login por e-mail) é bloqueado.
--
-- 7) A simulação mentia: listava como "movido" o que o real pulava por
--    conflito. Agora a simulação executa tudo de verdade e desfaz no fim —
--    o resumo é o que vai acontecer, inclusive o erro, se houver.
--
-- 8) Tempo. Cada comissão, saque ou pedido religado disparava um recálculo de
--    carteira (0,3–0,5 s cada); uma conta com histórico passava de 15 s, e a
--    tela chama pelo PostgREST, que corta em 8 s. Durante a unificação os
--    cinco gatilhos de recálculo esperam (`fitmind.recalculo_adiado`), e as
--    carteiras das duas contas são recalculadas uma vez no fim.
CREATE OR REPLACE FUNCTION public.admin_merge_profiles(p_source uuid, p_target uuid, p_actor uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_ctid tid;
  v_moved jsonb := '{}'::jsonb;
  v_skipped jsonb := '{}'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_erro text;
  v_cnt bigint;
  v_ok bigint;
  v_falha bigint;
  v_where text;
  v_from uuid;
  v_to uuid;
  v_identidade uuid[];
  v_src_student uuid;
  v_tgt_student uuid;
  v_src_coach uuid;
  v_tgt_coach uuid;
  v_src_client uuid;
  v_tgt_client uuid;
  v_src_user uuid;
  v_tgt_user uuid;
  v_actor_user uuid;
  v_claims_antes text;
  v_source profiles%ROWTYPE;
  v_target profiles%ROWTYPE;
BEGIN
  -- Quem pode
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem unificar cadastros' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_actor IS NOT NULL THEN
    SELECT user_id INTO v_actor_user FROM profiles WHERE id = p_actor;
    IF v_actor_user IS NULL OR NOT public.is_admin(v_actor_user) THEN
      RAISE EXCEPTION 'O responsável pela unificação precisa ser administrador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NOT p_dry_run THEN
    RAISE EXCEPTION 'Informe o administrador responsável pela unificação';
  END IF;

  -- O que unificar
  IF p_source IS NULL OR p_target IS NULL OR p_source = p_target THEN
    RAISE EXCEPTION 'Contas inválidas para unificação';
  END IF;
  SELECT * INTO v_source FROM profiles WHERE id = p_source;
  SELECT * INTO v_target FROM profiles WHERE id = p_target;
  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;
  IF v_target.merged_into_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'A conta principal já foi unificada em outra conta';
  END IF;
  IF v_source.merged_into_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'A conta de origem já foi unificada';
  END IF;

  v_src_user := v_source.user_id;
  v_tgt_user := v_target.user_id;
  SELECT id INTO v_src_student FROM students WHERE profile_id = p_source ORDER BY created_at LIMIT 1;
  SELECT id INTO v_tgt_student FROM students WHERE profile_id = p_target ORDER BY created_at LIMIT 1;
  SELECT id INTO v_src_coach FROM coaches WHERE profile_id = p_source ORDER BY created_at LIMIT 1;
  SELECT id INTO v_tgt_coach FROM coaches WHERE profile_id = p_target ORDER BY created_at LIMIT 1;
  -- As próprias linhas de aluno, coach e perfil das duas contas não são religadas pelo laço.
  v_identidade := array_remove(ARRAY[p_source, p_target, v_src_student, v_tgt_student, v_src_coach, v_tgt_coach], NULL);

  -- Trocar o dono da unidade (partner_members) exige admin no JWT.
  v_claims_antes := current_setting('request.jwt.claims', true);
  IF auth.uid() IS NULL AND v_actor_user IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_actor_user, 'role', 'authenticated')::text, true);
  END IF;

  BEGIN
    PERFORM set_config('fitmind.recalculo_adiado', 'on', true);

    -- Cliente de avaliação: o da origem é absorvido pelo do destino.
    IF v_src_student IS NOT NULL AND v_tgt_student IS NOT NULL THEN
      SELECT id INTO v_src_client FROM coach_evaluation_clients WHERE student_id = v_src_student ORDER BY created_at LIMIT 1;
      SELECT id INTO v_tgt_client FROM coach_evaluation_clients WHERE student_id = v_tgt_student ORDER BY created_at LIMIT 1;
      IF v_src_client IS NOT NULL AND v_tgt_client IS NOT NULL THEN
        UPDATE coach_body_assessments SET client_id = v_tgt_client, student_id = v_tgt_student WHERE client_id = v_src_client;
        UPDATE coach_evaluation_clients SET student_id = NULL WHERE id = v_src_client;
        v_moved := v_moved || jsonb_build_object('coach_evaluation_clients.merged', 1);
      END IF;
    END IF;

    -- Toda ligação para aluno, coach ou perfil da origem passa para o destino.
    FOR r IN
      SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col, c.confrelid::regclass::text AS ref
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f'
         AND array_length(c.conkey, 1) = 1
         AND c.confrelid IN ('public.students'::regclass, 'public.coaches'::regclass, 'public.profiles'::regclass)
         AND (c.conrelid::regclass::text, a.attname::text) NOT IN
             (('students', 'profile_id'), ('coaches', 'profile_id'), ('partners', 'profile_id'))
       ORDER BY 1, 2
    LOOP
      IF r.ref = 'students' THEN
        v_from := v_src_student; v_to := v_tgt_student;
      ELSIF r.ref = 'coaches' THEN
        v_from := v_src_coach; v_to := v_tgt_coach;
      ELSE
        v_from := p_source; v_to := p_target;
      END IF;
      CONTINUE WHEN v_from IS NULL OR v_to IS NULL OR v_from = v_to;

      v_where := format('%I = $1', r.col);
      IF r.tbl IN ('students', 'coaches', 'profiles') THEN
        v_where := v_where || ' AND id <> ALL($3)';
      END IF;

      EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', r.tbl, v_where)
        INTO v_cnt USING v_from, v_to, v_identidade;
      CONTINUE WHEN v_cnt = 0;

      BEGIN
        EXECUTE format('UPDATE public.%I SET %I = $2 WHERE %s', r.tbl, r.col, v_where)
          USING v_from, v_to, v_identidade;
        v_moved := v_moved || jsonb_build_object(r.tbl || '.' || r.col, v_cnt);
      EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation THEN
        -- Conflito: move linha a linha o que couber; o resto fica na origem.
        v_ok := 0; v_falha := 0;
        FOR v_ctid IN EXECUTE format('SELECT ctid FROM public.%I WHERE %s', r.tbl, v_where)
                        USING v_from, v_to, v_identidade LOOP
          BEGIN
            EXECUTE format('UPDATE public.%I SET %I = $1 WHERE ctid = $2', r.tbl, r.col) USING v_to, v_ctid;
            v_ok := v_ok + 1;
          EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation THEN
            v_falha := v_falha + 1;
          END;
        END LOOP;
        IF v_ok > 0 THEN v_moved := v_moved || jsonb_build_object(r.tbl || '.' || r.col, v_ok); END IF;
        IF v_falha > 0 THEN v_skipped := v_skipped || jsonb_build_object(r.tbl || '.' || r.col, v_falha); END IF;
      END;
    END LOOP;

    -- O coach do destino tinha a origem como upline: herda o upline dela.
    IF v_src_coach IS NOT NULL AND v_tgt_coach IS NOT NULL THEN
      UPDATE coaches SET upline_coach_id = (SELECT upline_coach_id FROM coaches WHERE id = v_src_coach)
       WHERE id = v_tgt_coach AND upline_coach_id = v_src_coach;
    END IF;
    -- O aluno do destino era cliente do coach da origem: viraria o próprio coach.
    IF v_src_coach IS NOT NULL AND v_tgt_student IS NOT NULL THEN
      UPDATE students
         SET coach_id = COALESCE(
               (SELECT coach_id FROM students WHERE id = v_src_student AND coach_id <> v_src_coach),
               (SELECT upline_coach_id FROM coaches WHERE id = v_src_coach))
       WHERE id = v_tgt_student AND coach_id = v_src_coach;
    END IF;

    -- O que a origem tem e o destino não: passa inteiro.
    IF v_src_student IS NOT NULL AND v_tgt_student IS NULL THEN
      UPDATE students SET profile_id = p_target WHERE id = v_src_student;
      v_moved := v_moved || jsonb_build_object('students.profile_id', 1);
    END IF;
    IF v_src_coach IS NOT NULL AND v_tgt_coach IS NULL THEN
      UPDATE coaches SET profile_id = p_target WHERE id = v_src_coach;
      v_moved := v_moved || jsonb_build_object('coaches.profile_id', 1);
    END IF;
    UPDATE partners SET profile_id = p_target WHERE profile_id = p_source;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    IF v_cnt > 0 THEN v_moved := v_moved || jsonb_build_object('partners.profile_id', v_cnt); END IF;

    -- Mensalidade: uma só por pessoa.
    IF v_src_user IS NOT NULL AND v_tgt_user IS NOT NULL AND v_src_user <> v_tgt_user
       AND EXISTS (SELECT 1 FROM user_subscriptions WHERE user_id = v_src_user) THEN
      IF EXISTS (SELECT 1 FROM user_subscriptions WHERE user_id = v_tgt_user) THEN
        UPDATE user_subscriptions SET status = 'cancelled', updated_at = now()
         WHERE user_id = v_src_user AND status <> 'cancelled';
        UPDATE subscription_invoices SET status = 'cancelled'
         WHERE user_id = v_src_user AND status IN ('pending', 'overdue', 'blocked');
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        v_moved := v_moved || jsonb_build_object('mensalidade_da_origem', 'cancelada', 'faturas_canceladas', v_cnt);
      ELSE
        UPDATE user_subscriptions SET user_id = v_tgt_user, updated_at = now() WHERE user_id = v_src_user;
        UPDATE subscription_invoices SET user_id = v_tgt_user WHERE user_id = v_src_user;
        GET DIAGNOSTICS v_cnt = ROW_COUNT;
        v_moved := v_moved || jsonb_build_object('mensalidade_da_origem', 'movida', 'faturas_movidas', v_cnt);
      END IF;
    END IF;

    -- O que sobrou da origem não fica duplicado.
    IF v_src_coach IS NOT NULL AND v_tgt_coach IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM students WHERE coach_id = v_src_coach)
         AND NOT EXISTS (SELECT 1 FROM coaches WHERE upline_coach_id = v_src_coach) THEN
        UPDATE coaches
           SET blocked_at = now(),
               blocked_reason = format('Conta duplicada, unificada em %s em %s', v_target.email,
                                       to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY'))
         WHERE id = v_src_coach AND blocked_at IS NULL;
        v_moved := v_moved || jsonb_build_object('coach_da_origem', 'bloqueado');
      ELSE
        v_avisos := v_avisos || to_jsonb('O coach da origem ainda tem alunos ou equipe e continua ativo.'::text);
      END IF;
    END IF;

    IF v_src_student IS NOT NULL AND v_tgt_student IS NOT NULL THEN
      v_cnt := 0;
      FOR r IN
        SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f'
           AND array_length(c.conkey, 1) = 1
           AND c.confrelid = 'public.students'::regclass
           AND c.conrelid <> 'public.student_wallets'::regclass
      LOOP
        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tbl, r.col) INTO v_ok USING v_src_student;
        v_cnt := v_cnt + v_ok;
      END LOOP;
      IF v_cnt = 0 AND NOT EXISTS (
           SELECT 1 FROM student_wallets
            WHERE student_id = v_src_student
              AND (COALESCE(available_balance, 0) <> 0 OR COALESCE(pending_balance, 0) <> 0
                   OR COALESCE(fitcoin_balance, 0) <> 0)) THEN
        DELETE FROM student_wallets WHERE student_id = v_src_student;
        DELETE FROM students WHERE id = v_src_student;
        v_moved := v_moved || jsonb_build_object('aluno_da_origem', 'removido (vazio)');
      ELSE
        v_avisos := v_avisos || to_jsonb(format('O cadastro de aluno da origem ainda tem %s ligação(ões) ou saldo e foi mantido.', v_cnt));
      END IF;
    END IF;

    -- Login: Apple/Google da origem passam a abrir o destino; o resto da origem para de entrar.
    IF v_src_user IS NOT NULL AND v_tgt_user IS NOT NULL AND v_src_user <> v_tgt_user THEN
      UPDATE auth.identities SET user_id = v_tgt_user, updated_at = now()
       WHERE user_id = v_src_user AND provider <> 'email'
         AND provider NOT IN (SELECT provider FROM auth.identities WHERE user_id = v_tgt_user);
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      IF v_cnt > 0 THEN v_moved := v_moved || jsonb_build_object('logins_movidos', v_cnt); END IF;
      DELETE FROM auth.sessions WHERE user_id = v_src_user;
      IF EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_src_user) THEN
        UPDATE auth.users SET banned_until = '2999-12-31'::timestamptz WHERE id = v_src_user;
        v_avisos := v_avisos || to_jsonb(format('O login da origem (%s) foi bloqueado. Oriente a pessoa a entrar com %s.',
          (SELECT string_agg(provider, ', ') FROM auth.identities WHERE user_id = v_src_user), v_target.email));
      END IF;
    END IF;

    UPDATE profiles
       SET merged_into_profile_id = p_target,
           merged_at = now(),
           status = 'merged',
           cpf = NULL,
           updated_at = now()
     WHERE id = p_source;

    -- As carteiras das duas contas, uma vez só.
    PERFORM set_config('fitmind.recalculo_adiado', 'off', true);
    PERFORM public.recalc_wallets_for_owner(p_target);
    PERFORM public.recalc_wallets_for_owner(p_source);
    IF v_tgt_student IS NOT NULL THEN
      PERFORM public.recalc_student_wallet_for_referral(v_tgt_student);
    END IF;

    -- Simulação: tudo acima rodou de verdade e é desfeito aqui.
    IF p_dry_run THEN
      RAISE EXCEPTION 'simulação' USING ERRCODE = 'P0099';
    END IF;

    INSERT INTO admin_audit_log (actor_profile_id, target_profile_id, action, notes)
    VALUES (p_actor, p_source, 'merge_profiles',
            format('Conta %s unificada em %s. Movido: %s. Mantido na origem (conflito): %s. Avisos: %s',
                   v_source.email, v_target.email, v_moved::text, v_skipped::text, v_avisos::text));
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN
      NULL;
    WHEN OTHERS THEN
      IF p_dry_run THEN
        v_erro := SQLERRM;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claims', COALESCE(v_claims_antes, ''), true);

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'source', jsonb_build_object('id', p_source, 'email', v_source.email, 'name', v_source.name, 'role', v_source.role),
    'target', jsonb_build_object('id', p_target, 'email', v_target.email, 'name', v_target.name, 'role', v_target.role),
    'moved', v_moved,
    'skipped', v_skipped,
    'avisos', v_avisos,
    'erro', v_erro
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_merge_profiles(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_profiles(uuid, uuid, uuid, boolean) TO service_role;

-- Os cinco gatilhos que recalculam carteira a cada linha esperam durante a
-- unificação. Fora dela `fitmind.recalculo_adiado` não existe e nada muda.

CREATE OR REPLACE FUNCTION public.commissions_sync_wallet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Unificação de cadastros recalcula as carteiras uma vez no fim (admin_merge_profiles).
  IF current_setting('fitmind.recalculo_adiado', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.is_referral, false) AND OLD.referred_by_student_id IS NOT NULL THEN
      PERFORM public.recalc_student_wallet_for_referral(OLD.referred_by_student_id);
    ELSIF OLD.beneficiary_profile_id IS NOT NULL THEN
      PERFORM public.recalc_wallet_for_profile(OLD.beneficiary_profile_id);
    END IF;
    RETURN OLD;
  ELSE
    IF COALESCE(NEW.is_referral, false) AND NEW.referred_by_student_id IS NOT NULL THEN
      PERFORM public.recalc_student_wallet_for_referral(NEW.referred_by_student_id);
    ELSIF NEW.beneficiary_profile_id IS NOT NULL THEN
      PERFORM public.recalc_wallet_for_profile(NEW.beneficiary_profile_id);
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF COALESCE(OLD.is_referral, false) AND OLD.referred_by_student_id IS NOT NULL
         AND OLD.referred_by_student_id IS DISTINCT FROM NEW.referred_by_student_id THEN
        PERFORM public.recalc_student_wallet_for_referral(OLD.referred_by_student_id);
      ELSIF OLD.beneficiary_profile_id IS NOT NULL
         AND OLD.beneficiary_profile_id IS DISTINCT FROM NEW.beneficiary_profile_id THEN
        PERFORM public.recalc_wallet_for_profile(OLD.beneficiary_profile_id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.withdrawal_requests_sync_wallet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Unificação de cadastros recalcula as carteiras uma vez no fim (admin_merge_profiles).
  IF current_setting('fitmind.recalculo_adiado', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.profile_id IS NOT NULL AND OLD.partner_id IS NULL AND OLD.professional_coach_id IS NULL THEN
      PERFORM public.recalc_wallet_for_profile(OLD.profile_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.profile_id IS NOT NULL AND NEW.partner_id IS NULL AND NEW.professional_coach_id IS NULL THEN
      PERFORM public.recalc_wallet_for_profile(NEW.profile_id);
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.profile_id IS DISTINCT FROM NEW.profile_id
       AND OLD.profile_id IS NOT NULL
       AND OLD.partner_id IS NULL
       AND OLD.professional_coach_id IS NULL THEN
      PERFORM public.recalc_wallet_for_profile(OLD.profile_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalc_on_withdrawal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_id uuid;
  v_coach_id uuid;
  v_profile_id uuid;
BEGIN
  -- Unificação de cadastros recalcula as carteiras uma vez no fim (admin_merge_profiles).
  IF current_setting('fitmind.recalculo_adiado', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_partner_id := COALESCE(NEW.partner_id, OLD.partner_id);
  v_coach_id := COALESCE(NEW.professional_coach_id, OLD.professional_coach_id);
  v_profile_id := COALESCE(NEW.profile_id, OLD.profile_id);

  IF v_partner_id IS NOT NULL THEN
    PERFORM public.recalc_partner_wallet(v_partner_id);
  END IF;
  IF v_coach_id IS NOT NULL THEN
    PERFORM public.recalc_professional_wallet(v_coach_id);
  END IF;
  IF v_profile_id IS NOT NULL THEN
    PERFORM public.recalc_wallets_for_owner(v_profile_id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalc_on_product_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_id uuid;
  v_coach_id uuid;
  v_profile_id uuid;
BEGIN
  -- Unificação de cadastros recalcula as carteiras uma vez no fim (admin_merge_profiles).
  IF current_setting('fitmind.recalculo_adiado', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_partner_id := COALESCE(NEW.partner_id, OLD.partner_id);
  v_coach_id := COALESCE(NEW.professional_coach_id, OLD.professional_coach_id);

  IF v_partner_id IS NOT NULL THEN
    PERFORM public.recalc_partner_wallet(v_partner_id);
    SELECT profile_id INTO v_profile_id FROM public.partners WHERE id = v_partner_id;
    IF v_profile_id IS NOT NULL THEN
      PERFORM public.recalc_wallet_for_profile(v_profile_id);
    END IF;
  END IF;

  IF v_coach_id IS NOT NULL THEN
    PERFORM public.recalc_professional_wallet(v_coach_id);
    SELECT profile_id INTO v_profile_id FROM public.coaches WHERE id = v_coach_id;
    IF v_profile_id IS NOT NULL THEN
      PERFORM public.recalc_wallet_for_profile(v_profile_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalc_buyer_wallet_on_wallet_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_new_method text;
  v_old_method text;
BEGIN
  -- Unificação de cadastros recalcula as carteiras uma vez no fim (admin_merge_profiles).
  IF current_setting('fitmind.recalculo_adiado', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_new_method := CASE WHEN TG_OP <> 'DELETE' THEN COALESCE(NEW.payment_method::text, '') ELSE '' END;
  v_old_method := CASE WHEN TG_OP <> 'INSERT' THEN COALESCE(OLD.payment_method::text, '') ELSE '' END;

  IF TG_OP <> 'DELETE' AND NEW.student_id IS NOT NULL THEN
    SELECT profile_id INTO v_profile_id FROM public.students WHERE id = NEW.student_id;
    IF v_profile_id IS NOT NULL AND v_new_method = 'wallet' THEN
      PERFORM public.recalc_wallets_for_owner(v_profile_id);
    END IF;
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.student_id IS NOT NULL THEN
    SELECT profile_id INTO v_profile_id FROM public.students WHERE id = OLD.student_id;
    IF v_profile_id IS NOT NULL AND (TG_OP = 'DELETE' OR v_old_method = 'wallet' OR (TG_OP = 'UPDATE' AND OLD.student_id IS DISTINCT FROM NEW.student_id)) THEN
      PERFORM public.recalc_wallets_for_owner(v_profile_id);
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
