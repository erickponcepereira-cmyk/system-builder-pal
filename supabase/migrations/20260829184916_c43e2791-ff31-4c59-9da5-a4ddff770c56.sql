alter table public.products
  add column if not exists grants_digital_product_id uuid references public.digital_products(id);

comment on column public.products.grants_digital_product_id is
  'Curso digital liberado automaticamente quando este produto e pago (ex.: Adesao Anual inclui a Formacao de Coach).';

create or replace function public.liberar_cursos_do_pedido(_order_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_student_id uuid;
  v_liberados int := 0;
begin
  select so.student_id into v_student_id
    from public.store_orders so
   where so.id = _order_id and so.status = 'paid';

  if v_student_id is null then
    return 0;
  end if;

  with alvos as (
    select i.digital_product_id as dpid, i.total_price
      from public.store_order_items i
     where i.order_id = _order_id
       and i.digital_product_id is not null
    union all
    select p.grants_digital_product_id, i.total_price
      from public.store_order_items i
      join public.products p on p.id = i.product_id
     where i.order_id = _order_id
       and p.grants_digital_product_id is not null
  ),
  novos as (
    insert into public.digital_purchases
      (student_id, digital_product_id, amount_paid, expires_at)
    select v_student_id,
           a.dpid,
           max(a.total_price),
           case when dp.access_days is null then null
                else now() + (dp.access_days || ' days')::interval end
      from alvos a
      join public.digital_products dp on dp.id = a.dpid
     where not exists (
       select 1 from public.digital_purchases d
        where d.student_id = v_student_id
          and d.digital_product_id = a.dpid
     )
     group by a.dpid, dp.access_days
    returning 1
  )
  select count(*) into v_liberados from novos;

  return v_liberados;
end;
$function$;