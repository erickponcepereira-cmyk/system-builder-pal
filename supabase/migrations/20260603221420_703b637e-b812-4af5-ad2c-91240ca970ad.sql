
CREATE TABLE public.professional_availability_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  block_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (professional_coach_id, block_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_availability_blocks TO authenticated;
GRANT ALL ON public.professional_availability_blocks TO service_role;
ALTER TABLE public.professional_availability_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks_read" ON public.professional_availability_blocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "blocks_owner_write" ON public.professional_availability_blocks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM coaches c JOIN profiles p ON p.id = c.profile_id WHERE c.id = professional_coach_id AND p.user_id = auth.uid()));
CREATE POLICY "blocks_owner_delete" ON public.professional_availability_blocks FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM coaches c JOIN profiles p ON p.id = c.profile_id WHERE c.id = professional_coach_id AND p.user_id = auth.uid()));
CREATE POLICY "blocks_admin_all" ON public.professional_availability_blocks FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.list_professional_available_slots(_coach_id uuid, _from timestamp with time zone, _to timestamp with time zone, _duration_minutes integer DEFAULT 30)
 RETURNS TABLE(slot_start timestamp with time zone, slot_end timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_day date;
  v_avail RECORD;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
BEGIN
  IF _duration_minutes IS NULL OR _duration_minutes < 5 THEN _duration_minutes := 30; END IF;
  FOR v_day IN SELECT generate_series(_from::date, _to::date, interval '1 day')::date LOOP
    IF EXISTS (SELECT 1 FROM public.professional_availability_blocks b WHERE b.professional_coach_id = _coach_id AND b.block_date = v_day) THEN
      CONTINUE;
    END IF;
    FOR v_avail IN
      SELECT * FROM public.professional_availability
      WHERE professional_coach_id = _coach_id AND is_active = true
        AND weekday = EXTRACT(DOW FROM v_day)::int
    LOOP
      v_slot_start := (v_day + v_avail.start_time)::timestamptz;
      LOOP
        v_slot_end := v_slot_start + make_interval(mins => _duration_minutes);
        EXIT WHEN v_slot_end::time > v_avail.end_time;
        IF v_slot_start >= now() AND NOT EXISTS (
          SELECT 1 FROM public.professional_appointments a
          WHERE a.professional_coach_id = _coach_id
            AND a.status = 'scheduled'
            AND a.starts_at < v_slot_end
            AND a.ends_at   > v_slot_start
        ) THEN
          slot_start := v_slot_start;
          slot_end := v_slot_end;
          RETURN NEXT;
        END IF;
        v_slot_start := v_slot_start + make_interval(mins => v_avail.slot_minutes);
      END LOOP;
    END LOOP;
  END LOOP;
END;
$function$;
