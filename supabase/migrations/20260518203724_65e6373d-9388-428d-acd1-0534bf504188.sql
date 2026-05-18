
-- Allow student_protocols to belong to either an in-app student OR an external evaluation client
ALTER TABLE public.student_protocols ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE public.student_protocols
  ADD COLUMN IF NOT EXISTS evaluation_client_id uuid REFERENCES public.coach_evaluation_clients(id) ON DELETE CASCADE;

-- Exactly one of the two must be set
ALTER TABLE public.student_protocols
  DROP CONSTRAINT IF EXISTS student_protocols_target_xor;
ALTER TABLE public.student_protocols
  ADD CONSTRAINT student_protocols_target_xor
  CHECK ((student_id IS NOT NULL)::int + (evaluation_client_id IS NOT NULL)::int = 1);

CREATE UNIQUE INDEX IF NOT EXISTS student_protocols_eval_client_uniq
  ON public.student_protocols(evaluation_client_id)
  WHERE evaluation_client_id IS NOT NULL;
