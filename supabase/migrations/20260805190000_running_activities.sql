-- Corrida GPS (MVP em primeiro plano)
--
-- A rota precisa é dado pessoal sensível: somente o próprio aluno pode ler
-- pontos brutos. Não conceder acesso genérico a coaches/admins nesta fase.
-- Qualquer ranking ou premiação futura deve recalcular as métricas no servidor
-- a partir dos pontos, em vez de confiar nos totais enviados pelo celular.

CREATE TABLE IF NOT EXISTS public.running_tracking_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  policy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.running_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  elapsed_seconds integer NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  moving_seconds integer NOT NULL DEFAULT 0 CHECK (moving_seconds >= 0),
  distance_meters numeric(12,2) NOT NULL DEFAULT 0 CHECK (distance_meters >= 0),
  excluded_distance_meters numeric(12,2) NOT NULL DEFAULT 0 CHECK (excluded_distance_meters >= 0),
  average_pace_seconds_per_km integer CHECK (average_pace_seconds_per_km > 0),
  best_pace_seconds_per_km integer CHECK (best_pace_seconds_per_km > 0),
  average_speed_mps numeric(8,3) CHECK (average_speed_mps >= 0),
  max_speed_mps numeric(8,3) CHECK (max_speed_mps >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'invalid', 'discarded')),
  activity_classification text NOT NULL DEFAULT 'unknown' CHECK (activity_classification IN ('run', 'bike_suspected', 'vehicle_suspected', 'mixed', 'unknown')),
  is_counted boolean NOT NULL DEFAULT false,
  validation_reason text,
  location_consent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS public.running_track_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.running_activities(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence >= 0),
  captured_at timestamptz NOT NULL,
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m numeric(8,2),
  altitude_m numeric(9,2),
  speed_mps numeric(8,3),
  heading_degrees numeric(7,2),
  segment_distance_m numeric(10,2) NOT NULL DEFAULT 0 CHECK (segment_distance_m >= 0),
  segment_duration_seconds numeric(10,3) NOT NULL DEFAULT 0 CHECK (segment_duration_seconds >= 0),
  segment_speed_mps numeric(8,3),
  quality_status text NOT NULL CHECK (quality_status IN ('accepted', 'ignored_accuracy', 'ignored_timestamp', 'ignored_jump', 'suspected_bike', 'suspected_vehicle')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.running_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.running_activities(id) ON DELETE CASCADE,
  km_number integer NOT NULL CHECK (km_number > 0),
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  pace_seconds_per_km integer NOT NULL CHECK (pace_seconds_per_km > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, km_number)
);

CREATE INDEX IF NOT EXISTS running_activities_student_started_idx
  ON public.running_activities (student_id, started_at DESC);
CREATE INDEX IF NOT EXISTS running_track_points_activity_sequence_idx
  ON public.running_track_points (activity_id, sequence);
CREATE INDEX IF NOT EXISTS running_splits_activity_km_idx
  ON public.running_splits (activity_id, km_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.running_tracking_consents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.running_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.running_track_points TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.running_splits TO authenticated;
GRANT ALL ON public.running_tracking_consents, public.running_activities, public.running_track_points, public.running_splits TO service_role;

ALTER TABLE public.running_tracking_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_track_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.running_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY running_consents_owner_all ON public.running_tracking_consents
FOR ALL TO authenticated
USING (student_id = ANY (public.current_user_student_ids()))
WITH CHECK (student_id = ANY (public.current_user_student_ids()));

CREATE POLICY running_activities_owner_all ON public.running_activities
FOR ALL TO authenticated
USING (student_id = ANY (public.current_user_student_ids()))
WITH CHECK (student_id = ANY (public.current_user_student_ids()));

CREATE POLICY running_track_points_owner_all ON public.running_track_points
FOR ALL TO authenticated
USING (
  activity_id IN (
    SELECT id FROM public.running_activities
    WHERE student_id = ANY (public.current_user_student_ids())
  )
)
WITH CHECK (
  activity_id IN (
    SELECT id FROM public.running_activities
    WHERE student_id = ANY (public.current_user_student_ids())
  )
);

CREATE POLICY running_splits_owner_all ON public.running_splits
FOR ALL TO authenticated
USING (
  activity_id IN (
    SELECT id FROM public.running_activities
    WHERE student_id = ANY (public.current_user_student_ids())
  )
)
WITH CHECK (
  activity_id IN (
    SELECT id FROM public.running_activities
    WHERE student_id = ANY (public.current_user_student_ids())
  )
);

CREATE TRIGGER update_running_tracking_consents_updated_at
BEFORE UPDATE ON public.running_tracking_consents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_running_activities_updated_at
BEFORE UPDATE ON public.running_activities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
