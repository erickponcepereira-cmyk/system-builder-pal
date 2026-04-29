CREATE OR REPLACE FUNCTION public.get_or_create_daily_quote()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id UUID;
  current_student_id UUID;
  selected_quote RECORD;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;

  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  SELECT mq.* INTO selected_quote
  FROM public.daily_quote_delivery dqd
  JOIN public.motivational_quotes mq ON mq.id = dqd.quote_id
  WHERE dqd.student_id = current_student_id
    AND dqd.delivered_date = CURRENT_DATE
  LIMIT 1;

  IF selected_quote.id IS NULL THEN
    SELECT mq.* INTO selected_quote
    FROM public.motivational_quotes mq
    WHERE mq.is_active = TRUE
    ORDER BY md5(mq.id::text || CURRENT_DATE::text || current_student_id::text)
    LIMIT 1;

    IF selected_quote.id IS NOT NULL THEN
      INSERT INTO public.daily_quote_delivery (student_id, quote_id, delivered_date)
      VALUES (current_student_id, selected_quote.id, CURRENT_DATE)
      ON CONFLICT (student_id, delivered_date) DO NOTHING;
    END IF;
  END IF;

  IF selected_quote.id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.profile_id = current_profile_id
      AND n.type = 'daily_motivation'
      AND n.created_at::DATE = CURRENT_DATE
  ) THEN
    INSERT INTO public.notifications (profile_id, type, title, message, action_url)
    VALUES (current_profile_id, 'daily_motivation', 'Frase do dia', selected_quote.quote, '/student/notifications');
  END IF;

  RETURN jsonb_build_object(
    'id', selected_quote.id,
    'quote', selected_quote.quote,
    'author', selected_quote.author,
    'category', selected_quote.category
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_daily_quote() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_daily_quote() TO authenticated;