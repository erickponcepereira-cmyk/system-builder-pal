UPDATE public.students
SET card_valid_until = NOW() + INTERVAL '30 days'
WHERE id = 'aa02db29-153b-420b-b096-0335b1f7b488';