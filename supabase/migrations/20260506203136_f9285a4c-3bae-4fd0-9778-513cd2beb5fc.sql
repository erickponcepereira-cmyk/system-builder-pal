ALTER TABLE public.internal_appointments
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS attendee_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendee_confirmed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS internal_appointments_public_token_key
  ON public.internal_appointments(public_token);