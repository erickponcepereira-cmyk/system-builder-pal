-- Enable cascade delete from competitions through enrollments, appointments, and hall_of_fame
ALTER TABLE public.competition_enrollments DROP CONSTRAINT IF EXISTS competition_enrollments_competition_id_fkey;
ALTER TABLE public.competition_enrollments ADD CONSTRAINT competition_enrollments_competition_id_fkey
  FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE CASCADE;

ALTER TABLE public.competition_enrollments DROP CONSTRAINT IF EXISTS competition_enrollments_group_id_fkey;
ALTER TABLE public.competition_enrollments ADD CONSTRAINT competition_enrollments_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES public.competition_groups(id) ON DELETE CASCADE;

ALTER TABLE public.competition_appointments DROP CONSTRAINT IF EXISTS competition_appointments_enrollment_id_fkey;
ALTER TABLE public.competition_appointments ADD CONSTRAINT competition_appointments_enrollment_id_fkey
  FOREIGN KEY (enrollment_id) REFERENCES public.competition_enrollments(id) ON DELETE CASCADE;

ALTER TABLE public.competition_hall_of_fame DROP CONSTRAINT IF EXISTS competition_hall_of_fame_competition_id_fkey;
ALTER TABLE public.competition_hall_of_fame ADD CONSTRAINT competition_hall_of_fame_competition_id_fkey
  FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE CASCADE;

ALTER TABLE public.competition_hall_of_fame DROP CONSTRAINT IF EXISTS competition_hall_of_fame_enrollment_id_fkey;
ALTER TABLE public.competition_hall_of_fame ADD CONSTRAINT competition_hall_of_fame_enrollment_id_fkey
  FOREIGN KEY (enrollment_id) REFERENCES public.competition_enrollments(id) ON DELETE CASCADE;