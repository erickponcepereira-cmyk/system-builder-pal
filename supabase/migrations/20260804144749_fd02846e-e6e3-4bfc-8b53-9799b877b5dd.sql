CREATE TABLE public.challenge_final_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.competition_groups(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  payload jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX challenge_final_reports_group_date_idx
  ON public.challenge_final_reports (group_id, report_date);

GRANT SELECT ON public.challenge_final_reports TO authenticated;
GRANT ALL ON public.challenge_final_reports TO service_role;

ALTER TABLE public.challenge_final_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view challenge final reports"
ON public.challenge_final_reports
FOR SELECT
TO authenticated
USING (public.current_user_is_admin());

CREATE TRIGGER update_challenge_final_reports_updated_at
BEFORE UPDATE ON public.challenge_final_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();