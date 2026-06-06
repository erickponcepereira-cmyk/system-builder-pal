
CREATE OR REPLACE FUNCTION public.admin_purge_user_dependents(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id uuid;
  v_student_id uuid;
  v_coach_id uuid;
  r record;
  v_sql text;
  v_summary jsonb := '{}'::jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Acesso negado';
    END IF;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = _user_id;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'note', 'no profile');
  END IF;

  SELECT id INTO v_student_id FROM public.students WHERE profile_id = v_profile_id;
  SELECT id INTO v_coach_id   FROM public.coaches  WHERE profile_id = v_profile_id;

  -- Explicit ordered chain for known nested deps.
  IF v_student_id IS NOT NULL THEN
    BEGIN DELETE FROM public.commissions WHERE transaction_id IN (
            SELECT id FROM public.transactions
            WHERE student_id = v_student_id
               OR subscription_id IN (SELECT id FROM public.subscriptions WHERE student_id = v_student_id)
          ); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM public.commissions WHERE referred_by_student_id = v_student_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM public.transactions WHERE student_id = v_student_id
            OR subscription_id IN (SELECT id FROM public.subscriptions WHERE student_id = v_student_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM public.subscriptions WHERE student_id = v_student_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  IF v_coach_id IS NOT NULL THEN
    BEGIN DELETE FROM public.commissions WHERE beneficiary_coach_id = v_coach_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  IF v_profile_id IS NOT NULL THEN
    BEGIN DELETE FROM public.commissions WHERE beneficiary_profile_id = v_profile_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Generic pass: NULL nullable FKs, DELETE rows on NOT NULL FKs.
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name,
           a.attnotnull AS not_null, cf.relname AS ref_table
    FROM pg_constraint con
    JOIN pg_class c   ON c.oid  = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class cf  ON cf.oid = con.confrelid
    JOIN pg_namespace nf ON nf.oid = cf.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = con.conkey[1]
    WHERE con.contype = 'f' AND nf.nspname = 'public'
      AND cf.relname IN ('profiles','students','coaches')
      AND n.nspname = 'public' AND con.confdeltype = 'a'
  LOOP
    DECLARE v_id uuid;
    BEGIN
      v_id := CASE r.ref_table
                WHEN 'profiles' THEN v_profile_id
                WHEN 'students' THEN v_student_id
                WHEN 'coaches'  THEN v_coach_id
              END;
      IF v_id IS NULL THEN CONTINUE; END IF;
      IF r.not_null THEN
        v_sql := format('DELETE FROM %I.%I WHERE %I = $1', r.schema_name, r.table_name, r.column_name);
      ELSE
        v_sql := format('UPDATE %I.%I SET %I = NULL WHERE %I = $1', r.schema_name, r.table_name, r.column_name, r.column_name);
      END IF;
      EXECUTE v_sql USING v_id;
    EXCEPTION WHEN OTHERS THEN
      v_summary := v_summary || jsonb_build_object(r.table_name || '.' || r.column_name, SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'errors', v_summary);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_user_dependents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_user_dependents(uuid) TO authenticated, service_role;
