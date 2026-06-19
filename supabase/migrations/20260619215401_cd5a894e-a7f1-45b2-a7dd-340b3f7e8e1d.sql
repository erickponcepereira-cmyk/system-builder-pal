-- Restamp commission.created_at to match original transaction paid_at so reprocessed
-- commissions don't appear duplicated at the reprocessing timestamp.
UPDATE public.commissions c
SET created_at = COALESCE(t.paid_at, t.created_at, c.created_at)
FROM public.transactions t
WHERE c.transaction_id = t.id
  AND c.created_at::date = DATE '2026-06-19'
  AND c.created_at >= '2026-06-19 21:00:00+00';
