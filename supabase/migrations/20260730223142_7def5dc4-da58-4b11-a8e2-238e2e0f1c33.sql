
create or replace function public.my_freebie_usage()
returns table (product_id uuid, kind text, used_week integer, used_month integer)
language sql
stable
security definer
set search_path = public
as $$
with me as (
  select p.id as profile_id,
         array(select s.id from public.students s where s.profile_id = p.id) as student_ids
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1
),
now_br as (
  select (now() at time zone 'America/Sao_Paulo') as ts
),
bounds as (
  select to_char(ts, 'IYYY-"W"IW') as wk,
         date_trunc('week', ts) as week_start,
         date_trunc('month', ts) as month_start
  from now_br
),
res as (
  select r.partner_product_id as product_id,
         'partner'::text as kind,
         case when r.iso_week = (select wk from bounds) then 1 else 0 end as w,
         case when (r.created_at at time zone 'America/Sao_Paulo') >= (select month_start from bounds) then 1 else 0 end as m
  from public.partner_freebie_reservations r, me
  where r.profile_id = me.profile_id
    and coalesce(r.status::text, '') in ('reserved', 'used')
),
pc as (
  select c.partner_product_id as product_id,
         'partner'::text as kind,
         case when (c.created_at at time zone 'America/Sao_Paulo') >= (select week_start from bounds) then 1 else 0 end as w,
         case when (c.created_at at time zone 'America/Sao_Paulo') >= (select month_start from bounds) then 1 else 0 end as m
  from public.partner_coupons c, me
  where c.student_id = any(me.student_ids)
    and coalesce(c.status::text, '') <> 'cancelled'
),
prc as (
  select c.professional_product_id as product_id,
         'professional'::text as kind,
         case when (c.created_at at time zone 'America/Sao_Paulo') >= (select week_start from bounds) then 1 else 0 end as w,
         case when (c.created_at at time zone 'America/Sao_Paulo') >= (select month_start from bounds) then 1 else 0 end as m
  from public.professional_coupons c, me
  where c.student_id = any(me.student_ids)
    and coalesce(c.status::text, '') <> 'cancelled'
),
all_rows as (
  select * from res
  union all select * from pc
  union all select * from prc
)
select product_id, kind, sum(w)::int as used_week, sum(m)::int as used_month
from all_rows
where product_id is not null
group by product_id, kind;
$$;

grant execute on function public.my_freebie_usage() to authenticated;
