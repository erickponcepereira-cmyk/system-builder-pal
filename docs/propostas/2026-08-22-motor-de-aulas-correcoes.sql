-- Correcoes do motor de aulas — FitMind Club
-- 22/08/2026. Aplicar no SQL editor do Supabase, depois do 2026-08-11-motor-de-aulas.sql.
--
-- Corrige um erro meu e fecha duas lacunas que a auditoria encontrou.

-- ---------------------------------------------------------------------------
-- 1. BUG: parceiro nao consegue criar curso
-- ---------------------------------------------------------------------------
-- coach_owns_digital_product resolve o dono por coach_created_courses -> coaches
-- -> profiles. "Profissional" no app E uma linha de coaches (coaches.is_professional),
-- entao profissional passa. PARCEIRO nao: parceiro e a tabela partners e nao tem
-- ligacao nenhuma com coach_created_courses. Resultado: a RLS de escrita barra o
-- painel de parceiro que ja esta no ar como aba de teste.
--
-- Espelha coach_created_courses, que ja e o padrao da casa para curso com rateio.

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

alter table public.partner_created_courses enable row level security;

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

-- Helper unico: coach, profissional OU parceiro. Substitui o antigo nas policies.
create or replace function public.can_manage_digital_product(_digital_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- coach criador (cobre profissional, que e coach com is_professional)
    exists (
      select 1
      from public.coach_created_courses ccc
      join public.coaches  c on c.id = ccc.creator_coach_id
      join public.profiles p on p.id = c.profile_id
      where p.user_id = auth.uid()
        and ccc.digital_product_id = _digital_product_id
    )
    -- empresa parceira criadora
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

-- Repoe as policies de escrita usando o helper novo.
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

-- ---------------------------------------------------------------------------
-- 2. Coluna que o painel promete e o schema nao tinha
-- ---------------------------------------------------------------------------
-- CreatorCoursesPanel oferece "exigir marca d'agua do aluno" por arquivo.
alter table public.digital_product_lessons
  add column if not exists require_watermark boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Vedacao: video_key nao pode ser legivel por quem nao comprou
-- ---------------------------------------------------------------------------
-- As policies acima ja restringem a LINHA. Mas vale lembrar a armadilha que
-- existe hoje em product_downloads e que NAO deve se repetir aqui:
-- a policy "Auth users can list product downloads" e FOR SELECT TO authenticated
-- USING (true), ou seja, qualquer logado le file_path de todo material.
-- Em digital_product_lessons o endereco do objeto (video_key) so e visivel para
-- quem comprou ou para quem administra. Confirme com:
--
-- select polname, polroles::regrole[], pg_get_expr(polqual, polrelid)
-- from pg_policy where polrelid = 'public.digital_product_lessons'::regclass;

-- ---------------------------------------------------------------------------
-- Verificacao final
-- ---------------------------------------------------------------------------
-- Nenhuma policy pode aparecer com {public}:
--
-- select c.relname, p.polname, p.polroles::regrole[]
-- from pg_policy p join pg_class c on c.oid = p.polrelid
-- where c.relname in ('digital_product_modules','digital_product_lessons',
--                     'digital_lesson_progress','partner_created_courses')
-- order by c.relname, p.polname;
