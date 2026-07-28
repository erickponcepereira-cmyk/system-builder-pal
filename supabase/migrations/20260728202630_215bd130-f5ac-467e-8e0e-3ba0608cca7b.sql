CREATE OR REPLACE FUNCTION public.list_professional_available_slots(_coach_id uuid, _from timestamp with time zone, _to timestamp with time zone, _duration_minutes integer DEFAULT 30)
 RETURNS TABLE(slot_start timestamp with time zone, slot_end timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_day date;
  v_avail RECORD;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_tz constant text := 'America/Sao_Paulo';
BEGIN
  IF _duration_minutes IS NULL OR _duration_minutes < 5 THEN _duration_minutes := 30; END IF;
  FOR v_day IN SELECT generate_series((_from AT TIME ZONE v_tz)::date, (_to AT TIME ZONE v_tz)::date, interval '1 day')::date LOOP
    IF EXISTS (SELECT 1 FROM public.professional_availability_blocks b WHERE b.professional_coach_id = _coach_id AND b.block_date = v_day) THEN
      CONTINUE;
    END IF;
    FOR v_avail IN
      WITH ordered AS (
        SELECT a.start_time, a.end_time, COALESCE(a.slot_minutes, 30) AS slot_minutes,
               LAG(a.end_time) OVER (PARTITION BY COALESCE(a.slot_minutes, 30) ORDER BY a.start_time) AS prev_end
        FROM public.professional_availability a
        WHERE a.professional_coach_id = _coach_id AND a.is_active = true
          AND a.weekday = EXTRACT(DOW FROM v_day)::int
      ), grp AS (
        SELECT o.*,
               SUM(CASE WHEN o.prev_end IS NOT NULL AND o.prev_end >= o.start_time THEN 0 ELSE 1 END)
                 OVER (PARTITION BY o.slot_minutes ORDER BY o.start_time ROWS UNBOUNDED PRECEDING) AS g
        FROM ordered o
      )
      SELECT MIN(g2.start_time) AS start_time, MAX(g2.end_time) AS end_time, g2.slot_minutes
      FROM grp g2
      GROUP BY g2.slot_minutes, g2.g
      ORDER BY 1
    LOOP
      v_slot_start := ((v_day + v_avail.start_time)::timestamp AT TIME ZONE v_tz);
      LOOP
        v_slot_end := v_slot_start + make_interval(mins => _duration_minutes);
        EXIT WHEN ((v_slot_end AT TIME ZONE v_tz)::time) > v_avail.end_time OR (v_slot_end AT TIME ZONE v_tz)::date > v_day;
        IF v_slot_start >= now() AND v_slot_start >= _from AND v_slot_end <= _to AND NOT EXISTS (
          SELECT 1 FROM public.professional_appointments a
          WHERE a.professional_coach_id = _coach_id
            AND a.status = 'scheduled'
            AND a.starts_at < v_slot_end
            AND a.ends_at   > v_slot_start
        ) AND NOT EXISTS (
          SELECT 1 FROM public.external_appointments ea
          WHERE ea.owner_type = 'professional' AND ea.owner_id = _coach_id
            AND ea.starts_at < v_slot_end AND ea.ends_at > v_slot_start
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