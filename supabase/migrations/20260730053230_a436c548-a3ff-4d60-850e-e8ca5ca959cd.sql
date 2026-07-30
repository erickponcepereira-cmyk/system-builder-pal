CREATE OR REPLACE FUNCTION public.partner_product_used_slots(_product_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(count(*), 0)::int
    FROM public.partner_product_orders o
   WHERE o.partner_product_id = _product_id
     AND COALESCE(o.status, '') NOT IN ('cancelled','refunded','failed')
     AND (
       COALESCE(o.status, '') <> 'pending'
       OR o.created_at > now() - interval '10 minutes'
     );
$function$;