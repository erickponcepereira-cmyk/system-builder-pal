CREATE TABLE IF NOT EXISTS public.membership_card_overrides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  escopo       text NOT NULL CHECK (escopo IN ('aluno','membro')),
  valido_ate   timestamptz NOT NULL,
  motivo       text,
  valor_anterior timestamptz,
  ativo        boolean NOT NULL DEFAULT true,
  criado_por   uuid REFERENCES public.profiles(id),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  revogado_por uuid REFERENCES public.profiles(id),
  revogado_em  timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mco_ativo
  ON public.membership_card_overrides (profile_id, escopo) WHERE ativo;

CREATE INDEX IF NOT EXISTS idx_mco_profile ON public.membership_card_overrides (profile_id, criado_em DESC);

ALTER TABLE public.membership_card_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mco_leitura" ON public.membership_card_overrides
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid())
         OR profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

GRANT SELECT ON public.membership_card_overrides TO authenticated;
GRANT ALL    ON public.membership_card_overrides TO service_role;

CREATE OR REPLACE FUNCTION public.carteirinha_situacao(_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn_situacao$
DECLARE
  v_student_id uuid;
  v_calc_aluno timestamptz;
  v_calc_membro timestamptz;
  v_exc_aluno record;
  v_exc_membro record;
  v_vig_aluno timestamptz;
  v_vig_membro timestamptz;
BEGIN
  SELECT s.id INTO v_student_id FROM public.students s WHERE s.profile_id = _profile_id LIMIT 1;

  -- Carteirinha de aluno: o maior entre as tres fontes de compra.
  SELECT max(x.expira) INTO v_calc_aluno FROM (
    SELECT COALESCE(t.paid_at, t.created_at)
             + make_interval(days => GREATEST(0, COALESCE(p.card_access_days,0))::int) AS expira
      FROM public.transactions t JOIN public.products p ON p.id = t.product_id
     WHERE t.student_id = v_student_id AND t.status = 'paid'
       AND COALESCE(p.card_access_days,0) > 0
    UNION ALL
    SELECT COALESCE(o.paid_at, o.created_at)
             + make_interval(days => GREATEST(0, COALESCE(NULLIF(o.metadata->>'perks_card_days','')::int,0))::int)
      FROM public.partner_product_orders o
     WHERE o.student_id = v_student_id AND o.status = 'paid'
       AND COALESCE(NULLIF(o.metadata->>'perks_card_days','')::int,0) > 0
    UNION ALL
    SELECT COALESCE(si.paid_at, k.granted_at) + INTERVAL '30 days'
      FROM public.student_challenge_tokens k
      JOIN public.subscription_invoices si ON si.id = k.source_subscription_invoice_id
     WHERE k.student_id = v_student_id AND k.source_subscription_invoice_id IS NOT NULL
  ) x;

  -- Carteirinha de membro: 30 dias por mensalidade paga ou isenta, sem acumular.
  SELECT max(COALESCE(si.paid_at, si.created_at) + INTERVAL '30 days') INTO v_calc_membro
    FROM public.subscription_invoices si
    JOIN public.profiles pr ON pr.user_id = si.user_id
   WHERE pr.id = _profile_id AND si.status::text IN ('paid','exempted')
     AND si.paid_at IS NOT NULL;

  SELECT * INTO v_exc_aluno FROM public.membership_card_overrides
   WHERE profile_id = _profile_id AND escopo = 'aluno' AND ativo LIMIT 1;

  SELECT * INTO v_exc_membro FROM public.membership_card_overrides
   WHERE profile_id = _profile_id AND escopo = 'membro' AND ativo LIMIT 1;

  v_vig_aluno  := COALESCE(v_exc_aluno.valido_ate,  v_calc_aluno);
  v_vig_membro := COALESCE(v_exc_membro.valido_ate, v_calc_membro);

  RETURN jsonb_build_object(
    'aluno', jsonb_build_object(
      'calculado', v_calc_aluno,
      'excecao',   v_exc_aluno.valido_ate,
      'vigente',   v_vig_aluno,
      'origem',    CASE WHEN v_exc_aluno.id IS NOT NULL THEN 'excecao manual' ELSE 'calculado pelas compras' END,
      'valido_hoje', COALESCE(v_vig_aluno > now(), false),
      'motivo',    v_exc_aluno.motivo,
      'gravado',   (SELECT s.card_valid_until FROM public.students s WHERE s.id = v_student_id)),
    'membro', jsonb_build_object(
      'calculado', v_calc_membro,
      'excecao',   v_exc_membro.valido_ate,
      'vigente',   v_vig_membro,
      'origem',    CASE WHEN v_exc_membro.id IS NOT NULL THEN 'excecao manual' ELSE 'calculado pela mensalidade' END,
      'valido_hoje', COALESCE(v_vig_membro > now(), false),
      'motivo',    v_exc_membro.motivo,
      'gravado_coach',   (SELECT c.card_valid_until FROM public.coaches c WHERE c.profile_id = _profile_id LIMIT 1),
      'gravado_parceiro',(SELECT pa.card_valid_until FROM public.partners pa WHERE pa.profile_id = _profile_id LIMIT 1)),
    'historico', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', o.id, 'escopo', o.escopo, 'valido_ate', o.valido_ate,
               'valor_anterior', o.valor_anterior, 'motivo', o.motivo,
               'ativo', o.ativo, 'criado_em', o.criado_em,
               'criado_por', (SELECT pq.name FROM public.profiles pq WHERE pq.id = o.criado_por),
               'revogado_em', o.revogado_em,
               'revogado_por', (SELECT pq2.name FROM public.profiles pq2 WHERE pq2.id = o.revogado_por))
             ORDER BY o.criado_em DESC)
        FROM public.membership_card_overrides o WHERE o.profile_id = _profile_id
    ), '[]'::jsonb));
END;
$fn_situacao$;

REVOKE ALL ON FUNCTION public.carteirinha_situacao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carteirinha_situacao(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.carteirinha_definir_excecao(
  _profile_id uuid, _escopo text, _valido_ate timestamptz,
  _motivo text, _admin_user_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn_excecao$
DECLARE
  v_admin uuid;
  v_anterior timestamptz;
  v_id uuid;
BEGIN
  IF NOT public.is_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF _escopo NOT IN ('aluno','membro') THEN
    RAISE EXCEPTION 'Escopo invalido: use aluno ou membro';
  END IF;
  IF _valido_ate IS NULL THEN
    RAISE EXCEPTION 'Informe ate quando a carteirinha vale';
  END IF;
  IF COALESCE(trim(_motivo),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo da excecao';
  END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE user_id = _admin_user_id;

  IF _escopo = 'aluno' THEN
    SELECT s.card_valid_until INTO v_anterior FROM public.students s WHERE s.profile_id = _profile_id LIMIT 1;
  ELSE
    SELECT c.card_valid_until INTO v_anterior FROM public.coaches c WHERE c.profile_id = _profile_id LIMIT 1;
  END IF;

  UPDATE public.membership_card_overrides
     SET ativo = false, revogado_por = v_admin, revogado_em = now()
   WHERE profile_id = _profile_id AND escopo = _escopo AND ativo;

  INSERT INTO public.membership_card_overrides
    (profile_id, escopo, valido_ate, motivo, valor_anterior, criado_por)
  VALUES (_profile_id, _escopo, _valido_ate, _motivo, v_anterior, v_admin)
  RETURNING id INTO v_id;

  IF _escopo = 'aluno' THEN
    UPDATE public.students SET card_valid_until = _valido_ate WHERE profile_id = _profile_id;
  ELSE
    UPDATE public.coaches  SET card_valid_until = _valido_ate WHERE profile_id = _profile_id;
    UPDATE public.partners SET card_valid_until = _valido_ate, updated_at = now() WHERE profile_id = _profile_id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'valor_anterior', v_anterior, 'valido_ate', _valido_ate);
END;
$fn_excecao$;

REVOKE ALL ON FUNCTION public.carteirinha_definir_excecao(uuid,text,timestamptz,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carteirinha_definir_excecao(uuid,text,timestamptz,text,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.carteirinha_revogar_excecao(_override_id uuid, _admin_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn_revoga$
DECLARE
  v_admin uuid;
  o record;
  v_novo timestamptz;
BEGIN
  IF NOT public.is_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO o FROM public.membership_card_overrides WHERE id = _override_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Excecao nao encontrada'; END IF;
  IF NOT o.ativo THEN RAISE EXCEPTION 'Esta excecao ja esta inativa'; END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE user_id = _admin_user_id;

  UPDATE public.membership_card_overrides
     SET ativo = false, revogado_por = v_admin, revogado_em = now()
   WHERE id = _override_id;

  -- Volta para a data CALCULADA, nao para o valor que estava antes da edicao.
  IF o.escopo = 'aluno' THEN
    PERFORM public.recalculate_student_card_access(
      (SELECT s.id FROM public.students s WHERE s.profile_id = o.profile_id LIMIT 1));
    SELECT s.card_valid_until INTO v_novo FROM public.students s WHERE s.profile_id = o.profile_id LIMIT 1;
  ELSE
    SELECT max(COALESCE(si.paid_at, si.created_at) + INTERVAL '30 days') INTO v_novo
      FROM public.subscription_invoices si
      JOIN public.profiles pr ON pr.user_id = si.user_id
     WHERE pr.id = o.profile_id AND si.status::text IN ('paid','exempted') AND si.paid_at IS NOT NULL;
    UPDATE public.coaches  SET card_valid_until = v_novo WHERE profile_id = o.profile_id;
    UPDATE public.partners SET card_valid_until = v_novo, updated_at = now() WHERE profile_id = o.profile_id;
  END IF;

  RETURN jsonb_build_object('revogada', _override_id, 'voltou_para', v_novo);
END;
$fn_revoga$;

REVOKE ALL ON FUNCTION public.carteirinha_revogar_excecao(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carteirinha_revogar_excecao(uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalculate_student_card_access(_student_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn_aluno_exc$
DECLARE
  v_until timestamptz := NULL;
  v_profile uuid;
  v_excecao timestamptz;
BEGIN
  IF _student_id IS NULL THEN RETURN NULL; END IF;

  SELECT max(x.expira) INTO v_until
  FROM (
    SELECT COALESCE(t.paid_at, t.created_at)
             + make_interval(days => GREATEST(0, COALESCE(p.card_access_days, 0))::int) AS expira
      FROM public.transactions t JOIN public.products p ON p.id = t.product_id
     WHERE t.student_id = _student_id AND t.status = 'paid'
       AND COALESCE(p.card_access_days, 0) > 0
       AND COALESCE(t.paid_at, t.created_at) IS NOT NULL
    UNION ALL
    SELECT COALESCE(o.paid_at, o.created_at)
             + make_interval(days => GREATEST(0, COALESCE(
                 NULLIF(o.metadata->>'perks_card_days','')::int, b.card_days, 0))::int)
      FROM public.partner_product_orders o
      LEFT JOIN public.partner_products      pp ON pp.id = o.partner_product_id
      LEFT JOIN public.professional_products fp ON fp.id = o.professional_product_id
      CROSS JOIN LATERAL public.compute_partner_product_benefits(
             GREATEST(COALESCE(o.gross_amount,0), COALESCE(pp.price, fp.price, 0))) b
     WHERE o.student_id = _student_id AND o.status = 'paid'
       AND COALESCE(o.paid_at, o.created_at) IS NOT NULL
       AND GREATEST(0, COALESCE(NULLIF(o.metadata->>'perks_card_days','')::int, b.card_days, 0)) > 0
    UNION ALL
    SELECT COALESCE(si.paid_at, k.granted_at) + INTERVAL '30 days'
      FROM public.student_challenge_tokens k
      JOIN public.subscription_invoices si ON si.id = k.source_subscription_invoice_id
     WHERE k.student_id = _student_id
       AND k.source_subscription_invoice_id IS NOT NULL
       AND COALESCE(si.paid_at, k.granted_at) IS NOT NULL
  ) x;

  -- >>> NOVO: excecao manual ativa manda no calculado.
  SELECT s.profile_id INTO v_profile FROM public.students s WHERE s.id = _student_id;
  IF v_profile IS NOT NULL THEN
    SELECT mo.valido_ate INTO v_excecao
      FROM public.membership_card_overrides mo
     WHERE mo.profile_id = v_profile AND mo.escopo = 'aluno' AND mo.ativo
     LIMIT 1;
    IF v_excecao IS NOT NULL THEN v_until := v_excecao; END IF;
  END IF;
  -- <<<

  UPDATE public.students SET card_valid_until = v_until WHERE id = _student_id;
  RETURN v_until;
END;
$fn_aluno_exc$;