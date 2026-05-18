
-- Tabela de check-ins via QR
CREATE TABLE IF NOT EXISTS public.student_checkin_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  scanned_by_profile_id UUID REFERENCES public.profiles(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  location TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_scans_student ON public.student_checkin_scans(student_id, scanned_at DESC);

ALTER TABLE public.student_checkin_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student sees own scans" ON public.student_checkin_scans
  FOR SELECT TO authenticated
  USING (
    student_id = public.current_student_id()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.coaches c ON c.id = s.coach_id
      WHERE s.id = student_checkin_scans.student_id
        AND c.profile_id = public.current_profile_id()
    )
  );

CREATE POLICY "Authenticated can insert via RPC only" ON public.student_checkin_scans
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- RPC: registra presença via QR code (chamado por coach/admin escaneando)
CREATE OR REPLACE FUNCTION public.register_checkin_via_qr(_student_id UUID, _location TEXT DEFAULT NULL, _notes TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  scanner_profile_id UUID;
  active_sub_id UUID;
  scan_id UUID;
  student_name TEXT;
BEGIN
  SELECT id INTO scanner_profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF scanner_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT p.name INTO student_name
  FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.id = _student_id;

  IF student_name IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  INSERT INTO public.student_checkin_scans (student_id, scanned_by_profile_id, location, notes)
  VALUES (_student_id, scanner_profile_id, _location, _notes)
  RETURNING id INTO scan_id;

  SELECT id INTO active_sub_id
  FROM public.subscriptions
  WHERE student_id = _student_id AND status = 'active' AND end_date >= CURRENT_DATE
  ORDER BY end_date DESC LIMIT 1;

  INSERT INTO public.attendance_logs (student_id, subscription_id, log_date, attended, activity_type, notes)
  VALUES (_student_id, active_sub_id, CURRENT_DATE, TRUE, 'checkin_qr', _notes)
  ON CONFLICT (student_id, log_date, activity_type) DO UPDATE SET attended = TRUE;

  RETURN jsonb_build_object('scan_id', scan_id, 'student_name', student_name, 'scanned_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_checkin_via_qr(UUID, TEXT, TEXT) TO authenticated;
