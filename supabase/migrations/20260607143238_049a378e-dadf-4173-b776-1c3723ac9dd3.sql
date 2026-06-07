
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS challenge_override_allowed boolean NOT NULL DEFAULT false;

UPDATE public.students
  SET challenge_override_allowed = true
  WHERE id = '36bbe864-5c71-41e9-93bb-caa8989878f5';

INSERT INTO public.student_challenge_tokens (student_id, granted_by, notes)
VALUES ('36bbe864-5c71-41e9-93bb-caa8989878f5', 'admin', 'Demo: liberado manualmente para Erick (coach) participar do desafio.');
