DELETE FROM public.coach_points_log
WHERE transaction_id IS NULL
  AND reason = 'sale';