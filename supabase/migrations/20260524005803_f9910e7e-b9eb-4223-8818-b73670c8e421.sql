-- Zerar vendas/transações e dados financeiros derivados
TRUNCATE TABLE
  public.transaction_professional_assignments,
  public.sale_nutritionist_assignments,
  public.commissions,
  public.master_coach_commissions,
  public.course_teacher_commissions,
  public.mercadopago_payments,
  public.store_order_items,
  public.store_orders,
  public.digital_purchases,
  public.product_order_pool_entries,
  public.coach_points_log,
  public.coach_transfers,
  public.withdrawal_requests,
  public.student_withdrawal_requests,
  public.monthly_rankings,
  public.points_redeem_orders,
  public.subscriptions,
  public.transactions
RESTART IDENTITY CASCADE;

-- Zerar carteiras
UPDATE public.wallets SET
  available_balance = 0, pending_balance = 0, total_earned = 0, total_withdrawn = 0;

UPDATE public.nutritionist_wallets SET
  available_balance = 0, blocked_balance = 0, total_earned = 0, total_released = 0, total_withdrawn = 0;

UPDATE public.student_wallets SET
  available_balance = 0, pending_balance = 0, total_earned = 0, total_withdrawn = 0;

-- Zerar contadores fictícios nos coaches
UPDATE public.coaches SET
  total_sales = 0, total_points = 0, total_active_students = 0;