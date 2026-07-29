ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS merged_into_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_merged_into ON public.profiles(merged_into_profile_id);

-- CPF único entre perfis ativos (ignora pontuação e perfis já unificados)
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_cpf_active
  ON public.profiles ((regexp_replace(cpf, '\D', '', 'g')))
  WHERE cpf IS NOT NULL AND cpf <> '' AND merged_into_profile_id IS NULL;

CREATE OR REPLACE FUNCTION public.admin_merge_profiles(
  p_source uuid,
  p_target uuid,
  p_actor uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_moved jsonb := '{}'::jsonb;
  v_cnt bigint;
  v_src_student uuid;
  v_tgt_student uuid;
  v_src_coach uuid;
  v_tgt_coach uuid;
  v_source profiles%ROWTYPE;
  v_target profiles%ROWTYPE;

  PROCEDURE_placeholder int;
BEGIN
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

  SELECT id INTO v_src_student FROM students WHERE profile_id = p_source ORDER BY created_at LIMIT 1;
  SELECT id INTO v_tgt_student FROM students WHERE profile_id = p_target ORDER BY created_at LIMIT 1;
  SELECT id INTO v_src_coach FROM coaches WHERE profile_id = p_source ORDER BY created_at LIMIT 1;
  SELECT id INTO v_tgt_coach FROM coaches WHERE profile_id = p_target ORDER BY created_at LIMIT 1;

  -- Percorre todas as chaves estrangeiras que apontam para students/coaches/profiles
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl,
           a.attname AS col,
           c.confrelid::regclass::text AS ref
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
      AND c.confrelid IN ('public.students'::regclass, 'public.coaches'::regclass, 'public.profiles'::regclass)
      AND c.conrelid::regclass::text NOT IN ('students', 'coaches', 'profiles')
    ORDER BY 1, 2
  LOOP
    DECLARE
      v_from uuid;
      v_to uuid;
    BEGIN
      IF r.ref = 'students' THEN
        v_from := v_src_student; v_to := v_tgt_student;
      ELSIF r.ref = 'coaches' THEN
        v_from := v_src_coach; v_to := v_tgt_coach;
      ELSE
        v_from := p_source; v_to := p_target;
      END IF;

      IF v_from IS NULL OR v_to IS NULL OR v_from = v_to THEN
        CONTINUE;
      END IF;

      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tbl, r.col)
        INTO v_cnt USING v_from;

      IF v_cnt = 0 THEN CONTINUE; END IF;

      IF NOT p_dry_run THEN
        BEGIN
          EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', r.tbl, r.col, r.col)
            USING v_to, v_from;
        EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation THEN
          -- registro duplicado na conta principal: descarta o da conta absorvida
          EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.tbl, r.col) USING v_from;
        END;
      END IF;

      v_moved := v_moved || jsonb_build_object(r.tbl || '.' || r.col, v_cnt);
    END;
  END LOOP;

  IF NOT p_dry_run THEN
    -- Linhas de aluno/coach duplicadas: remove a da conta absorvida ou repassa a titularidade
    IF v_src_student IS NOT NULL AND v_tgt_student IS NOT NULL THEN
      DELETE FROM students WHERE id = v_src_student;
    ELSIF v_src_student IS NOT NULL THEN
      UPDATE students SET profile_id = p_target WHERE id = v_src_student;
    END IF;

    IF v_src_coach IS NOT NULL AND v_tgt_coach IS NOT NULL THEN
      DELETE FROM coaches WHERE id = v_src_coach;
    ELSIF v_src_coach IS NOT NULL THEN
      UPDATE coaches SET profile_id = p_target WHERE id = v_src_coach;
    END IF;

    UPDATE partners SET profile_id = p_target WHERE profile_id = p_source;

    UPDATE profiles
       SET merged_into_profile_id = p_target,
           merged_at = now(),
           status = 'merged',
           cpf = NULL,
           cpf_hash = NULL,
           updated_at = now()
     WHERE id = p_source;

    INSERT INTO admin_audit_log (actor_profile_id, target_profile_id, action, notes)
    VALUES (p_actor, p_source, 'merge_profiles',
            format('Conta %s unificada em %s. Movido: %s', v_source.email, v_target.email, v_moved::text));
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'source', jsonb_build_object('id', p_source, 'email', v_source.email, 'name', v_source.name, 'role', v_source.role),
    'target', jsonb_build_object('id', p_target, 'email', v_target.email, 'name', v_target.name, 'role', v_target.role),
    'moved', v_moved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_merge_profiles(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_profiles(uuid, uuid, uuid, boolean) TO service_role;