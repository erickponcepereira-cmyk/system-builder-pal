DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT pr.id FROM public.profiles pr
    LEFT JOIN public.students s ON s.profile_id = pr.id
    WHERE pr.role = 'student' AND s.id IS NULL AND pr.user_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.ensure_student_for_profile(p.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip % : %', p.id, SQLERRM;
    END;
  END LOOP;
END $$;