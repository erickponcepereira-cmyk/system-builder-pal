-- Motor de aulas da área de membros — FitMind Club
-- Escrito em 11/08/2026. Aplicar no SQL editor do Supabase.
--
-- Quatro objetos. Modelagem espelha coach_course_modules, que já funciona,
-- generalizada para qualquer digital_product.
--
-- ATENÇÃO às políticas: toda policy leva TO authenticated explícito. Foi a
-- ausência dessa cláusula que expôs dados bancários e CPF esta semana —
-- sem TO, o Postgres aplica a PUBLIC, que inclui anon.

-- ---------------------------------------------------------------------------
-- 1. Módulos
-- ---------------------------------------------------------------------------
create table if not exists public.digital_product_modules (
  id                  uuid primary key default gen_random_uuid(),
  digital_product_id  uuid not null references public.digital_products(id) on delete cascade,
  title               text not null,
  description         text,
  sort_order          integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_dpm_product on public.digital_product_modules(digital_product_id, sort_order);

-- ---------------------------------------------------------------------------
-- 2. Aulas
-- ---------------------------------------------------------------------------
-- unlock_rule:
--   none       — liberada sempre (padrão)
--   sequential — libera ao concluir a aula anterior do mesmo curso
--   drip       — libera unlock_days após a compra
--   date       — libera em unlock_at
create table if not exists public.digital_product_lessons (
  id                     uuid primary key default gen_random_uuid(),
  module_id              uuid not null references public.digital_product_modules(id) on delete cascade,
  title                  text not null,
  description            text,
  kind                   text not null default 'video'
                           check (kind in ('video','ebook','live','download')),

  -- Vídeo: video_key aponta para o objeto no bucket privado (link assinado na
  -- hora). video_url fica só para conteúdo aberto hospedado fora.
  video_key              text,
  video_url              text,
  duration_seconds       integer,

  -- Material da aula. allow_download = false força leitura protegida.
  file_path              text,
  allow_download         boolean not null default true,

  unlock_rule            text not null default 'none'
                           check (unlock_rule in ('none','sequential','drip','date')),
  unlock_days            integer,
  unlock_at              timestamptz,

  counts_for_certificate boolean not null default true,
  sort_order             integer not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint dpl_drip_needs_days check (unlock_rule <> 'drip' or unlock_days is not null),
  constraint dpl_date_needs_at   check (unlock_rule <> 'date' or unlock_at is not null)
);

create index if not exists idx_dpl_module on public.digital_product_lessons(module_id, sort_order);

-- ---------------------------------------------------------------------------
-- 3. Progresso por aula
-- ---------------------------------------------------------------------------
create table if not exists public.digital_lesson_progress (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references public.students(id) on delete cascade,
  lesson_id             uuid not null references public.digital_product_lessons(id) on delete cascade,
  completed_at          timestamptz,
  last_position_seconds integer not null default 0,
  updated_at            timestamptz not null default now(),
  unique (student_id, lesson_id)
);

create index if not exists idx_dlp_student on public.digital_lesson_progress(student_id);
create index if not exists idx_dlp_lesson  on public.digital_lesson_progress(lesson_id);

-- ---------------------------------------------------------------------------
-- 4. Ebook preso ao curso — a coluna que faltava
-- ---------------------------------------------------------------------------
alter table public.product_downloads
  add column if not exists digital_product_id uuid references public.digital_products(id) on delete cascade;

create index if not exists idx_pd_digital on public.product_downloads(digital_product_id);

-- ---------------------------------------------------------------------------
-- Helpers de acesso
-- ---------------------------------------------------------------------------
-- search_path fixo de propósito: função sem search_path definido foi um dos
-- avisos do scanner.
create or replace function public.student_owns_digital_product(_digital_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.digital_purchases dp
    join public.students s   on s.id = dp.student_id
    join public.profiles  p  on p.id = s.profile_id
    where p.user_id = auth.uid()
      and dp.digital_product_id = _digital_product_id
      and (dp.expires_at is null or dp.expires_at > now())
  );
$$;

create or replace function public.coach_owns_digital_product(_digital_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.coach_created_courses ccc
    join public.coaches  c on c.id = ccc.creator_coach_id
    join public.profiles p on p.id = c.profile_id
    where p.user_id = auth.uid()
      and ccc.digital_product_id = _digital_product_id
  );
$$;

revoke execute on function public.student_owns_digital_product(uuid) from anon;
revoke execute on function public.coach_owns_digital_product(uuid)   from anon;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.digital_product_modules  enable row level security;
alter table public.digital_product_lessons  enable row level security;
alter table public.digital_lesson_progress  enable row level security;

-- Módulos: quem comprou lê; quem criou lê e escreve.
create policy dpm_select on public.digital_product_modules
for select to authenticated
using (
  public.student_owns_digital_product(digital_product_id)
  or public.coach_owns_digital_product(digital_product_id)
);

create policy dpm_write on public.digital_product_modules
for all to authenticated
using      (public.coach_owns_digital_product(digital_product_id))
with check (public.coach_owns_digital_product(digital_product_id));

-- Aulas: mesma regra, subindo pelo módulo.
create policy dpl_select on public.digital_product_lessons
for select to authenticated
using (exists (
  select 1 from public.digital_product_modules m
  where m.id = module_id
    and (public.student_owns_digital_product(m.digital_product_id)
      or public.coach_owns_digital_product(m.digital_product_id))
));

create policy dpl_write on public.digital_product_lessons
for all to authenticated
using (exists (
  select 1 from public.digital_product_modules m
  where m.id = module_id and public.coach_owns_digital_product(m.digital_product_id)
))
with check (exists (
  select 1 from public.digital_product_modules m
  where m.id = module_id and public.coach_owns_digital_product(m.digital_product_id)
));

-- Progresso: o aluno mexe no próprio.
create policy dlp_own on public.digital_lesson_progress
for all to authenticated
using (student_id in (
  select s.id from public.students s
  join public.profiles p on p.id = s.profile_id
  where p.user_id = auth.uid()
))
with check (student_id in (
  select s.id from public.students s
  join public.profiles p on p.id = s.profile_id
  where p.user_id = auth.uid()
));

-- O criador lê o progresso de quem comprou o curso dele — só progresso.
-- Nome sai de profiles, que já tem grant de coluna; CPF e telefone seguem fora.
create policy dlp_creator_read on public.digital_lesson_progress
for select to authenticated
using (exists (
  select 1
  from public.digital_product_lessons l
  join public.digital_product_modules m on m.id = l.module_id
  where l.id = lesson_id and public.coach_owns_digital_product(m.digital_product_id)
));

-- ---------------------------------------------------------------------------
-- Verificação
-- ---------------------------------------------------------------------------
-- Toda policy criada aqui precisa aparecer com {authenticated}, nunca {public}:
--
-- select polname, polroles::regrole[]
-- from pg_policy
-- where polrelid in (
--   'public.digital_product_modules'::regclass,
--   'public.digital_product_lessons'::regclass,
--   'public.digital_lesson_progress'::regclass
-- );
