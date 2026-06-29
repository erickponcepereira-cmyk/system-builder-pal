CREATE POLICY "Master coach can read commissioned transactions"
ON public.transactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.commissions c
    JOIN public.profiles p ON p.id = c.beneficiary_profile_id
    WHERE c.transaction_id = transactions.id
      AND c.is_master_coach_commission = true
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Master coach can read commissioned partner orders"
ON public.partner_product_orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.commissions c
    JOIN public.profiles p ON p.id = c.beneficiary_profile_id
    WHERE c.partner_order_id = partner_product_orders.id
      AND c.is_master_coach_commission = true
      AND p.user_id = auth.uid()
  )
);