begin;

create table if not exists public.course_exams (
  id                 uuid primary key default gen_random_uuid(),
  digital_product_id uuid not null references public.digital_products(id) on delete cascade,
  module_id          uuid references public.digital_product_modules(id) on delete cascade,
  title              text not null,
  description        text,
  passing_score      int  not null default 70 check (passing_score between 1 and 100),
  max_attempts       int  check (max_attempts is null or max_attempts > 0),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create index if not exists idx_ce_product on public.course_exams(digital_product_id);
create index if not exists idx_ce_module  on public.course_exams(module_id);

create unique index if not exists uq_ce_final
  on public.course_exams(digital_product_id) where module_id is null;
create unique index if not exists uq_ce_modulo
  on public.course_exams(module_id) where module_id is not null;

create table if not exists public.course_exam_questions (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references public.course_exams(id) on delete cascade,
  prompt     text not null,
  explanation text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_ceq_exam on public.course_exam_questions(exam_id, sort_order);

create table if not exists public.course_exam_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.course_exam_questions(id) on delete cascade,
  label       text not null,
  is_correct  boolean not null default false,
  sort_order  int not null default 0
);
create index if not exists idx_ceo_question on public.course_exam_options(question_id, sort_order);

create table if not exists public.course_exam_attempts (
  id          uuid primary key default gen_random_uuid(),
  exam_id     uuid not null references public.course_exams(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  score       int  not null check (score between 0 and 100),
  passed      boolean not null,
  answers     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cea_aluno on public.course_exam_attempts(student_id, exam_id);

create table if not exists public.course_certificates (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.students(id) on delete cascade,
  digital_product_id uuid not null references public.digital_products(id) on delete cascade,
  code               text not null unique,
  issued_at          timestamptz not null default now(),
  unique (student_id, digital_product_id)
);

grant select, insert, update, delete on public.course_exams          to authenticated;
grant select, insert, update, delete on public.course_exam_questions to authenticated;
grant select, insert, update, delete on public.course_exam_options   to authenticated;
grant select                          on public.course_exam_attempts  to authenticated;
grant select                          on public.course_certificates   to authenticated;
grant all on public.course_exams          to service_role;
grant all on public.course_exam_questions to service_role;
grant all on public.course_exam_options   to service_role;
grant all on public.course_exam_attempts  to service_role;
grant all on public.course_certificates   to service_role;

alter table public.course_exams           enable row level security;
alter table public.course_exam_questions  enable row level security;
alter table public.course_exam_options    enable row level security;
alter table public.course_exam_attempts   enable row level security;
alter table public.course_certificates    enable row level security;

drop policy if exists ce_criador on public.course_exams;
create policy ce_criador on public.course_exams
for all to authenticated
using      (public.can_manage_digital_product(digital_product_id))
with check (public.can_manage_digital_product(digital_product_id));

drop policy if exists ceq_criador on public.course_exam_questions;
create policy ceq_criador on public.course_exam_questions
for all to authenticated
using (exists (
  select 1 from public.course_exams e
  where e.id = exam_id and public.can_manage_digital_product(e.digital_product_id)))
with check (exists (
  select 1 from public.course_exams e
  where e.id = exam_id and public.can_manage_digital_product(e.digital_product_id)));

drop policy if exists ceo_criador on public.course_exam_options;
create policy ceo_criador on public.course_exam_options
for all to authenticated
using (exists (
  select 1 from public.course_exam_questions q
  join public.course_exams e on e.id = q.exam_id
  where q.id = question_id and public.can_manage_digital_product(e.digital_product_id)))
with check (exists (
  select 1 from public.course_exam_questions q
  join public.course_exams e on e.id = q.exam_id
  where q.id = question_id and public.can_manage_digital_product(e.digital_product_id)));

drop policy if exists cea_aluno on public.course_exam_attempts;
create policy cea_aluno on public.course_exam_attempts
for select to authenticated
using (student_id in (
  select s.id from public.students s
  join public.profiles p on p.id = s.profile_id
  where p.user_id = auth.uid()
));

drop policy if exists cea_criador on public.course_exam_attempts;
create policy cea_criador on public.course_exam_attempts
for select to authenticated
using (exists (
  select 1 from public.course_exams e
  where e.id = exam_id and public.can_manage_digital_product(e.digital_product_id)));

drop policy if exists cc_aluno on public.course_certificates;
create policy cc_aluno on public.course_certificates
for select to authenticated
using (student_id in (
  select s.id from public.students s
  join public.profiles p on p.id = s.profile_id
  where p.user_id = auth.uid()
));

drop policy if exists cc_criador on public.course_certificates;
create policy cc_criador on public.course_certificates
for select to authenticated
using (public.can_manage_digital_product(digital_product_id));

create or replace function public.prova_para_responder(_exam_id uuid)
returns table (
  question_id uuid,
  prompt      text,
  sort_order  int,
  option_id   uuid,
  label       text,
  option_order int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select q.id, q.prompt, q.sort_order, o.id, o.label, o.sort_order
    from public.course_exams e
    join public.course_exam_questions q on q.exam_id = e.id
    join public.course_exam_options   o on o.question_id = q.id
   where e.id = _exam_id
     and e.is_active
     and public.can_view_digital_product(e.digital_product_id)
   order by q.sort_order, q.id, o.sort_order, o.id;
$fn$;

revoke execute on function public.prova_para_responder(uuid) from public;
grant  execute on function public.prova_para_responder(uuid) to authenticated;

create or replace function public.submeter_prova(_exam_id uuid, _respostas jsonb)
returns table (nota int, aprovado boolean, acertos int, total_perguntas int)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_student_id uuid;
  v_exam       public.course_exams%rowtype;
  v_total      int;
  v_acertos    int;
  v_score      int;
  v_passou     boolean;
  v_tentativas int;
begin
  select e.* into v_exam from public.course_exams e where e.id = _exam_id and e.is_active;
  if v_exam.id is null then
    raise exception 'Prova nao encontrada.' using errcode = '22023';
  end if;

  if not public.can_view_digital_product(v_exam.digital_product_id) then
    raise exception 'Voce nao tem acesso a este curso.' using errcode = '42501';
  end if;

  select s.id into v_student_id
    from public.students s
    join public.profiles p on p.id = s.profile_id
   where p.user_id = auth.uid()
   limit 1;
  if v_student_id is null then
    raise exception 'So alunos fazem prova.' using errcode = '42501';
  end if;

  if v_exam.max_attempts is not null then
    select count(*) into v_tentativas
      from public.course_exam_attempts a
     where a.exam_id = _exam_id and a.student_id = v_student_id;
    if v_tentativas >= v_exam.max_attempts then
      raise exception 'Voce ja usou as % tentativas desta prova.', v_exam.max_attempts
        using errcode = '22023';
    end if;
  end if;

  select count(*) into v_total
    from public.course_exam_questions q where q.exam_id = _exam_id;
  if v_total = 0 then
    raise exception 'Esta prova ainda nao tem perguntas.' using errcode = '22023';
  end if;

  select count(*) into v_acertos
    from jsonb_array_elements(_respostas) r
    join public.course_exam_questions q
      on q.id = (r->>'question_id')::uuid and q.exam_id = _exam_id
    join public.course_exam_options o
      on o.id = (r->>'option_id')::uuid and o.question_id = q.id
   where o.is_correct;

  v_score  := floor((v_acertos::numeric / v_total) * 100);
  v_passou := v_score >= v_exam.passing_score;

  insert into public.course_exam_attempts (exam_id, student_id, score, passed, answers)
  values (_exam_id, v_student_id, v_score, v_passou, coalesce(_respostas, '[]'::jsonb));

  return query select v_score, v_passou, v_acertos, v_total;
end;
$fn$;

revoke execute on function public.submeter_prova(uuid, jsonb) from public;
grant  execute on function public.submeter_prova(uuid, jsonb) to authenticated;

create or replace function public.gabarito_da_prova(_exam_id uuid)
returns table (
  question_id uuid,
  prompt      text,
  explanation text,
  option_id   uuid,
  label       text,
  is_correct  boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select q.id, q.prompt, q.explanation, o.id, o.label, o.is_correct
    from public.course_exams e
    join public.course_exam_questions q on q.exam_id = e.id
    join public.course_exam_options   o on o.question_id = q.id
   where e.id = _exam_id
     and exists (
       select 1
         from public.course_exam_attempts a
         join public.students s on s.id = a.student_id
         join public.profiles p on p.id = s.profile_id
        where a.exam_id = _exam_id and p.user_id = auth.uid()
     )
   order by q.sort_order, q.id, o.sort_order, o.id;
$fn$;

revoke execute on function public.gabarito_da_prova(uuid) from public;
grant  execute on function public.gabarito_da_prova(uuid) to authenticated;

create or replace function public.emitir_certificado(_digital_product_id uuid)
returns table (codigo text, emitido_em timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_student_id uuid;
  v_faltando   int;
  v_exam_id    uuid;
  v_aprovado   boolean;
  v_code       text;
  v_issued     timestamptz;
begin
  if not public.can_view_digital_product(_digital_product_id) then
    raise exception 'Voce nao tem acesso a este curso.' using errcode = '42501';
  end if;

  select s.id into v_student_id
    from public.students s
    join public.profiles p on p.id = s.profile_id
   where p.user_id = auth.uid()
   limit 1;
  if v_student_id is null then
    raise exception 'So alunos recebem certificado.' using errcode = '42501';
  end if;

  select c.code, c.issued_at into v_code, v_issued
    from public.course_certificates c
   where c.student_id = v_student_id
     and c.digital_product_id = _digital_product_id;
  if v_code is not null then
    return query select v_code, v_issued;
    return;
  end if;

  select count(*) into v_faltando
    from public.digital_product_lessons l
    join public.digital_product_modules m on m.id = l.module_id
   where m.digital_product_id = _digital_product_id
     and m.is_active and l.is_active
     and l.counts_for_certificate
     and not exists (
       select 1 from public.digital_lesson_progress g
        where g.lesson_id = l.id
          and g.student_id = v_student_id
          and g.completed_at is not null
     );
  if v_faltando > 0 then
    raise exception 'Ainda faltam % aulas para concluir o curso.', v_faltando
      using errcode = '22023';
  end if;

  select id into v_exam_id
    from public.course_exams
   where digital_product_id = _digital_product_id and module_id is null and is_active;

  if v_exam_id is not null then
    select exists (
      select 1 from public.course_exam_attempts
       where exam_id = v_exam_id and student_id = v_student_id and passed
    ) into v_aprovado;
    if not v_aprovado then
      raise exception 'Voce precisa ser aprovado na prova final.' using errcode = '22023';
    end if;
  end if;

  for i in 1..5 loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (
      select 1 from public.course_certificates c where c.code = v_code
    );
    v_code := null;
  end loop;

  if v_code is null then
    raise exception 'Nao foi possivel gerar o codigo do certificado. Tente de novo.'
      using errcode = '55000';
  end if;

  insert into public.course_certificates (student_id, digital_product_id, code)
  values (v_student_id, _digital_product_id, v_code)
  returning course_certificates.code, course_certificates.issued_at
       into v_code, v_issued;

  return query select v_code, v_issued;
end;
$fn$;

revoke execute on function public.emitir_certificado(uuid) from public;
grant  execute on function public.emitir_certificado(uuid) to authenticated;

create or replace function public.verificar_certificado(_code text)
returns table (aluno text, curso text, emitido_em timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p.name, d.title, c.issued_at
    from public.course_certificates c
    join public.students s        on s.id = c.student_id
    join public.profiles p        on p.id = s.profile_id
    join public.digital_products d on d.id = c.digital_product_id
   where c.code = upper(btrim(_code))
   limit 1;
$fn$;

revoke execute on function public.verificar_certificado(text) from public;
grant  execute on function public.verificar_certificado(text) to anon, authenticated;

commit;