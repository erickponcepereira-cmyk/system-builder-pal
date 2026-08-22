-- Curso "Formacao de Coach" + regra de acesso por mensalidade — FitMind Club
-- 22/08/2026. Aplicar depois de 2026-08-11 e 2026-08-22-motor-de-aulas-correcoes.

-- ---------------------------------------------------------------------------
-- 1. Regra de acesso que faltava: curso incluso na mensalidade
-- ---------------------------------------------------------------------------
-- student_owns_digital_product exige linha em digital_purchases. O curso de
-- formacao e GRATUITO para coach que paga mensalidade — esse coach nunca vai
-- ter uma linha de compra. Sem isto, a RLS barraria justamente o publico-alvo.
alter table public.digital_products
  add column if not exists included_for_active_coaches boolean not null default false;

-- Helper unico de leitura: comprou OU e coach adimplente e o curso e incluso.
-- is_user_blocked_by_subscription ja existe e e a regra oficial de inadimplencia
-- (usada por checkMyBlockStatus / SubscriptionGuard). Reaproveitada aqui para
-- nao inventar uma segunda definicao de "em dia".
create or replace function public.can_view_digital_product(_digital_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- 1) comprou
    exists (
      select 1
      from public.digital_purchases dp
      join public.students s  on s.id = dp.student_id
      join public.profiles  p on p.id = s.profile_id
      where p.user_id = auth.uid()
        and dp.digital_product_id = _digital_product_id
        and (dp.expires_at is null or dp.expires_at > now())
    )
    -- 2) curso incluso na mensalidade e o coach esta adimplente
    or exists (
      select 1
      from public.digital_products d
      join public.coaches  c on true
      join public.profiles p on p.id = c.profile_id
      where d.id = _digital_product_id
        and d.included_for_active_coaches = true
        and p.user_id = auth.uid()
        and c.approved_at is not null
        and not public.is_user_blocked_by_subscription(p.user_id)
    )
    -- 3) quem administra o curso enxerga sempre
    or public.can_manage_digital_product(_digital_product_id);
$$;

revoke execute on function public.can_view_digital_product(uuid) from anon;

-- Repoe as policies de leitura com o helper novo.
drop policy if exists dpm_select on public.digital_product_modules;
create policy dpm_select on public.digital_product_modules
for select to authenticated
using (public.can_view_digital_product(digital_product_id));

drop policy if exists dpl_select on public.digital_product_lessons;
create policy dpl_select on public.digital_product_lessons
for select to authenticated
using (exists (
  select 1 from public.digital_product_modules m
  where m.id = module_id and public.can_view_digital_product(m.digital_product_id)
));

-- ---------------------------------------------------------------------------
-- 2. Bucket privado das aulas
-- ---------------------------------------------------------------------------
-- Privado de proposito: o acesso e sempre por link assinado gerado no servidor
-- depois de checar can_view_digital_product. Nenhuma policy de leitura publica.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-videos', 'course-videos', false, 2147483648,
        array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Quem administra o curso pode subir e trocar arquivo. Ninguem le direto:
-- leitura e so via link assinado do servidor.
drop policy if exists course_videos_manage on storage.objects;
create policy course_videos_manage on storage.objects
for all to authenticated
using (
  bucket_id = 'course-videos'
  and exists (select 1 from public.profiles p
              where p.user_id = auth.uid() and p.is_master_admin = true)
)
with check (
  bucket_id = 'course-videos'
  and exists (select 1 from public.profiles p
              where p.user_id = auth.uid() and p.is_master_admin = true)
);

-- ---------------------------------------------------------------------------
-- 3. O curso, com ids fixos para ser reaplicavel sem duplicar
-- ---------------------------------------------------------------------------
insert into public.digital_products
  (id, title, description, price, status, type, instructor, duration_hours,
   sort_order, included_for_active_coaches)
values (
  'c0a5e000-0000-4000-a000-000000000001',
  'Formação de Coach FitMind',
  'Formação oficial do método FitMind. Incluída na mensalidade do coach.',
  0, 'active', 'coach_training', 'FitMind', 2, 1, true
)
on conflict (id) do update
  set title = excluded.title,
      description = excluded.description,
      status = excluded.status,
      included_for_active_coaches = true;

insert into public.digital_product_modules (id, digital_product_id, title, sort_order)
values
  ('c0a5e000-0000-4000-a000-000000000101', 'c0a5e000-0000-4000-a000-000000000001', 'Módulo 1 — Fundamentos', 1),
  ('c0a5e000-0000-4000-a000-000000000102', 'c0a5e000-0000-4000-a000-000000000001', 'Módulo 2 — Aplicação', 2)
on conflict (id) do update set title = excluded.title, sort_order = excluded.sort_order;

-- unlock_rule sequential: a aula 2 abre quando a 1 for concluida.
-- video_key aponta para o objeto no bucket privado (upload no passo seguinte).
insert into public.digital_product_lessons
  (id, module_id, title, kind, video_key, duration_seconds, unlock_rule, sort_order)
values
  ('c0a5e000-0000-4000-a000-000000001001', 'c0a5e000-0000-4000-a000-000000000101',
   'Aula 1 — Abertura', 'video', 'formacao-coach/m1-a1.mp4', 1192, 'none', 1),
  ('c0a5e000-0000-4000-a000-000000001002', 'c0a5e000-0000-4000-a000-000000000101',
   'Aula 2 — Fundamentos na prática', 'video', 'formacao-coach/m1-a2.mp4', 2244, 'sequential', 2),
  ('c0a5e000-0000-4000-a000-000000001003', 'c0a5e000-0000-4000-a000-000000000102',
   'Aula 1 — Aplicando o método', 'video', 'formacao-coach/m2-a1.mp4', 1365, 'sequential', 1),
  ('c0a5e000-0000-4000-a000-000000001004', 'c0a5e000-0000-4000-a000-000000000102',
   'Aula 2 — Fechamento', 'video', 'formacao-coach/m2-a2.mp4', 1211, 'sequential', 2)
on conflict (id) do update
  set title = excluded.title,
      video_key = excluded.video_key,
      duration_seconds = excluded.duration_seconds,
      unlock_rule = excluded.unlock_rule,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Conferencia
-- ---------------------------------------------------------------------------
-- select m.title as modulo, l.sort_order, l.title, l.unlock_rule, l.video_key
-- from public.digital_product_lessons l
-- join public.digital_product_modules m on m.id = l.module_id
-- where m.digital_product_id = 'c0a5e000-0000-4000-a000-000000000001'
-- order by m.sort_order, l.sort_order;

-- ---------------------------------------------------------------------------
-- 4. Variante para o servidor
-- ---------------------------------------------------------------------------
-- can_view_digital_product usa auth.uid(), que e nulo quando a chamada vem do
-- servidor com a chave de servico. A funcao de playback precisa avaliar o
-- acesso de um usuario especifico, entao recebe o id explicitamente.
-- Mesma logica, uma fonte de verdade so.
create or replace function public.can_view_digital_product_for(
  _digital_product_id uuid,
  _user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from public.digital_purchases dp
      join public.students s  on s.id = dp.student_id
      join public.profiles  p on p.id = s.profile_id
      where p.user_id = _user_id
        and dp.digital_product_id = _digital_product_id
        and (dp.expires_at is null or dp.expires_at > now())
    )
    or exists (
      select 1
      from public.digital_products d
      join public.profiles p on p.user_id = _user_id
      join public.coaches  c on c.profile_id = p.id
      where d.id = _digital_product_id
        and d.included_for_active_coaches = true
        and c.approved_at is not null
        and not public.is_user_blocked_by_subscription(_user_id)
    )
    or exists (
      select 1
      from public.profiles p
      where p.user_id = _user_id and p.is_master_admin = true
    );
$$;

revoke execute on function public.can_view_digital_product_for(uuid, uuid) from anon, authenticated;
