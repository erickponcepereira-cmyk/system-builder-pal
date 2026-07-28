-- Coaches com pedido de ativação pago porém sem activation_paid_at
WITH paid_activation AS (
  SELECT DISTINCT ON (st.profile_id)
         st.profile_id,
         so.id      AS order_id,
         so.paid_at AS paid_at
    FROM public.store_orders so
    JOIN public.store_order_items soi ON soi.order_id = so.id
    JOIN public.students st ON st.id = so.student_id
   WHERE so.status = 'paid'
     AND 'b43baf23-76b6-4abc-91a4-2730b3570d77' IN (
           COALESCE(soi.product_id::text, ''),
           COALESCE(soi.store_product_id::text, ''),
           COALESCE(soi.digital_product_id::text, '')
         )
   ORDER BY st.profile_id, so.paid_at DESC NULLS LAST
)
UPDATE public.coaches c
   SET activation_paid_at  = COALESCE(pa.paid_at, now()),
       activation_order_id = pa.order_id,
       activation_source   = COALESCE(c.activation_source, 'purchased')
  FROM paid_activation pa
 WHERE c.profile_id = pa.profile_id
   AND c.activation_paid_at IS NULL;

-- Parceiros no mesmo caso
WITH paid_activation AS (
  SELECT DISTINCT ON (st.profile_id)
         st.profile_id,
         so.paid_at AS paid_at
    FROM public.store_orders so
    JOIN public.store_order_items soi ON soi.order_id = so.id
    JOIN public.students st ON st.id = so.student_id
   WHERE so.status = 'paid'
     AND 'b43baf23-76b6-4abc-91a4-2730b3570d77' IN (
           COALESCE(soi.product_id::text, ''),
           COALESCE(soi.store_product_id::text, ''),
           COALESCE(soi.digital_product_id::text, '')
         )
   ORDER BY st.profile_id, so.paid_at DESC NULLS LAST
)
UPDATE public.partners p
   SET activation_paid_at = COALESCE(pa.paid_at, now()),
       activation_source  = COALESCE(p.activation_source, 'purchased')
  FROM paid_activation pa
 WHERE p.profile_id = pa.profile_id
   AND p.activation_paid_at IS NULL;