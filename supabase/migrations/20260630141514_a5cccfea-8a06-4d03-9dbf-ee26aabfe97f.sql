
-- Recalcula campos derivados das vendas pagas via UPDATE direto (sem chamar handler).
WITH calc AS (
  SELECT
    o.id,
    ROUND(o.gross_amount * (CASE WHEN o.payment_method='pix' THEN 0.99 ELSE 4.98 END) / 100, 2) AS fee,
    o.gross_amount AS g
  FROM public.partner_product_orders o
  WHERE o.status = 'paid'
),
cascade1 AS (
  SELECT c.*, ROUND(c.g - c.fee, 2) AS rem1 FROM calc c
),
cascade2 AS (
  SELECT c.*, ROUND(c.rem1 * 6 / 100, 2) AS tax FROM cascade1 c
),
cascade3 AS (
  SELECT c.*, ROUND(c.rem1 - c.tax, 2) AS rem2 FROM cascade2 c
),
cascade4 AS (
  SELECT c.*, ROUND(c.rem2 * 5 / 100, 2) AS sys FROM cascade3 c
),
cascade5 AS (
  SELECT c.*, ROUND(c.rem2 - c.sys, 2) AS rem3 FROM cascade4 c
),
final AS (
  SELECT
    c.id, c.fee, c.tax, c.sys,
    ROUND(c.rem3 * COALESCE(o.coach_commission_pct, 10) / 100, 2) AS coach_amt,
    ROUND(c.rem3 - ROUND(c.rem3 * COALESCE(o.coach_commission_pct, 10) / 100, 2), 2) AS partner_share,
    o.referred_by_student_id, o.student_id
  FROM cascade5 c
  JOIN public.partner_product_orders o ON o.id = c.id
),
finalx AS (
  SELECT
    f.id, f.fee, f.tax, f.sys, f.coach_amt, f.partner_share,
    ROUND(f.coach_amt * 3 / 100, 2) AS l1,
    ROUND(f.coach_amt * 2 / 100, 2) AS l2,
    ROUND(f.coach_amt * 1 / 100, 2) AS l3,
    CASE
      WHEN f.referred_by_student_id IS NOT NULL AND f.referred_by_student_id <> f.student_id AND f.coach_amt > 0
      THEN CEIL(f.coach_amt * 50) / 100
      ELSE 0
    END AS fitcoin
  FROM final f
)
UPDATE public.partner_product_orders o
SET payment_fee = fx.fee,
    tax_amount = fx.tax,
    system_fee = fx.sys,
    coach_commission_amount = fx.coach_amt,
    network_l1_amount = fx.l1,
    network_l2_amount = fx.l2,
    network_l3_amount = fx.l3,
    referral_fitcoin_amount = fx.fitcoin,
    coach_net_amount = GREATEST(0, ROUND(fx.coach_amt - fx.l1 - fx.l2 - fx.l3 - fx.fitcoin, 2)),
    partner_net_amount = fx.partner_share
FROM finalx fx
WHERE o.id = fx.id;
