create table if not exists public.partner_created_courses (
  id                            uuid primary key default gen_random_uuid(),
  partner_id                    uuid not null references public.partners(id) on delete cascade,
  digital_product_id            uuid not null references public.digital_products(id) on delete cascade,
  creator_commission_percentage numeric not null default 0,
  platform_percentage           numeric,
  upline_commission_percentage  numeric,
  status                        text default 'active',
  approved_by_admin             boolean default false,
  approved_at                   timestamptz,
  created_at                    timestamptz not null default now(),
  unique (partner_id, digital_product_id)
);

create index if not exists idx_pcc_partner on public.partner_created_courses(partner_id);
create index if not exists idx_pcc_product on public.partner_created_courses(digital_product_id);

grant select, insert, update, delete on public.partner_created_courses to authenticated;
grant all on public.partner_created_courses to service_role;

alter table public.partner_created_courses enable row level security;

drop policy if exists pcc_owner on public.partner_created_courses;
create policy pcc_owner on public.partner_created_courses
for all to authenticated
using (partner_id in (
  select p.id from public.partners p
  join public.profiles pr on pr.id = p.profile_id
  where pr.user_id = auth.uid()
))
with check (partner_id in (
  select p.id from public.partners p
  join public.profiles pr on pr.id = p.profile_id
  where pr.user_id = auth.uid()
));

drop policy if exists pcc_admin on public.partner_created_courses;
create policy pcc_admin on public.partner_created_courses
for all to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create or replace function public.can_manage_digital_product(_digital_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from public.coach_created_courses ccc
      join public.coaches  c on c.id = ccc.creator_coach_id
      join public.profiles p on p.id = c.profile_id
      where p.user_id = auth.uid()
        and ccc.digital_product_id = _digital_product_id
    )
    or exists (
      select 1
      from public.partner_created_courses pcc
      join public.partners pa on pa.id = pcc.partner_id
      join public.profiles p  on p.id = pa.profile_id
      where p.user_id = auth.uid()
        and pcc.digital_product_id = _digital_product_id
    );
$$;

revoke execute on function public.can_manage_digital_product(uuid) from anon;
revoke execute on function public.can_manage_digital_product(uuid) from public;
grant execute on function public.can_manage_digital_product(uuid) to authenticated;
grant execute on function public.can_manage_digital_product(uuid) to service_role;

drop policy if exists dpm_write on public.digital_product_modules;
create policy dpm_write on public.digital_product_modules
for all to authenticated
using      (public.can_manage_digital_product(digital_product_id))
with check (public.can_manage_digital_product(digital_product_id));

drop policy if exists dpm_select on public.digital_product_modules;
create policy dpm_select on public.digital_product_modules
for select to authenticated
using (
  public.student_owns_digital_product(digital_product_id)
  or public.can_manage_digital_product(digital_product_id)
);

drop policy if exists dpl_write on public.digital_product_lessons;
create policy dpl_write on public.digital_product_lessons
for all to authenticated
using (exists (
  select 1 from public.digital_product_modules m
  where m.id = module_id and public.can_manage_digital_product(m.digital_product_id)
))
with check (exists (
  select 1 from public.digital_product_modules m
  where m.id = module_id and public.can_manage_digital_product(m.digital_product_id)
));

drop policy if exists dpl_select on public.digital_product_lessons;
create policy dpl_select on public.digital_product_lessons
for select to authenticated
using (exists (
  select 1 from public.digital_product_modules m
  where m.id = module_id
    and (public.student_owns_digital_product(m.digital_product_id)
      or public.can_manage_digital_product(m.digital_product_id))
));

drop policy if exists dlp_creator_read on public.digital_lesson_progress;
create policy dlp_creator_read on public.digital_lesson_progress
for select to authenticated
using (exists (
  select 1
  from public.digital_product_lessons l
  join public.digital_product_modules m on m.id = l.module_id
  where l.id = lesson_id and public.can_manage_digital_product(m.digital_product_id)
));

alter table public.digital_product_lessons
  add column if not exists require_watermark boolean not null default false;