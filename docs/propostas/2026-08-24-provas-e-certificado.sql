-- Provas e certificado do curso — FitMind Club
-- 24/08/2026. Aplicar no SQL editor do Supabase, depois de
-- 2026-08-23-criar-curso.sql.
--
-- O QUE ISTO FECHA
--
-- O motor de aulas ja entrega video protegido e progresso. Faltavam as duas
-- pecas que transformam "assistir" em "concluir": a prova e o certificado.
-- A coluna `counts_for_certificate` existia nas aulas desde agosto e nunca
-- foi lida por ninguem.
--
-- A DECISAO QUE DITA TODO O DESENHO
--
-- O GABARITO NUNCA CHEGA AO NAVEGADOR.
--
-- E o erro mais comum em area de membros: mandar as alternativas com um campo
-- `correta: true` e conferir no cliente. Quem abre o inspetor passa em
-- qualquer prova, e o certificado vira enfeite.
--
-- Aqui o aluno NAO tem SELECT nas tabelas de prova. Ele so alcanca duas
-- funcoes security-definer: uma devolve a prova SEM o gabarito, a outra
-- recebe as respostas, corrige NO BANCO e devolve a nota. A correcao acontece
-- num lugar onde o aluno nao chega.
--
-- Nao usei permissao por coluna para esconder `is_correct`. Foi exatamente
-- lista branca de coluna que derrubou a aba de gratuitos em 23/08: basta uma
-- coluna barrada para o PostgREST recusar a consulta inteira, e o erro chega
-- disfarcado de lista vazia. Negar a tabela e dar a funcao e mais simples de
-- entender e mais dificil de quebrar sem perceber.

begin;

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------

-- Uma prova por modulo, ou uma prova final do curso (module_id nulo).
-- Cobre os dois formatos que as plataformas usam sem inventar um terceiro.
create table if not exists public.course_exams (
  id                 uuid primary key default gen_random_uuid(),
  digital_product_id uuid not null references public.digital_products(id) on delete cascade,
  module_id          uuid references public.digital_product_modules(id) on delete cascade,
  title              text not null,
  description        text,
  -- Percentual de acerto para passar. 70 e o costume do mercado.
  passing_score      int  not null default 70 check (passing_score between 1 and 100),
  -- Nulo = tentativas ilimitadas.
  max_attempts       int  check (max_attempts is null or max_attempts > 0),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create index if not exists idx_ce_product on public.course_exams(digital_product_id);
create index if not exists idx_ce_module  on public.course_exams(module_id);

-- Uma prova final por curso; uma prova por modulo. Evita duas provas na mesma
-- porta, que e a origem de "qual delas vale?".
create unique index if not exists uq_ce_final
  on public.course_exams(digital_product_id) where module_id is null;
create unique index if not exists uq_ce_modulo
  on public.course_exams(module_id) where module_id is not null;

create table if not exists public.course_exam_questions (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references public.course_exams(id) on delete cascade,
  prompt     text not null,
  -- Explicacao mostrada DEPOIS de responder. Ensina em vez de so reprovar.
  explanation text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ceq_exam on public.course_exam_questions(exam_id, sort_order);

create table if not exists public.course_exam_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.course_exam_questions(id) on delete cascade,
  label       text not null,
  -- O gabarito. Esta coluna NUNCA sai desta tabela para um aluno.
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
  -- Codigo curto de verificacao. E o que um terceiro digita para conferir.
  code               text not null unique,
  issued_at          timestamptz not null default now(),
  unique (student_id, digital_product_id)
);

-- ---------------------------------------------------------------------------
-- 2. RLS — o criador administra, o aluno nao enxerga nada direto
-- ---------------------------------------------------------------------------
-- Todas com TO explicito. Sem o TO o Postgres aplica a PUBLIC, que inclui
-- `anon` — foi essa omissao que expos dados bancarios em agosto.

alter table public.course_exams           enable row level security;
alter table public.course_exam_questions  enable row level security;
alter table public.course_exam_options    enable row level security;
alter table public.course_exam_attempts   enable row level security;
alter table public.course_certificates    enable row level security;

-- Criador: manda na prova inteira do curso dele.
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

-- ATENCAO: NAO existe policy de SELECT para aluno em course_exam_options.
-- E de proposito. O aluno chega na prova so pela funcao `prova_para_responder`.

-- Tentativas: o aluno le as proprias; o criador le as da turma dele.
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

-- Ninguem escreve tentativa direto: so a funcao de corrigir.

-- Certificado: o dono le o dele; o criador le os do curso dele.
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

-- ---------------------------------------------------------------------------
-- 3. A prova, sem gabarito
-- ---------------------------------------------------------------------------
-- Devolve pergunta e alternativas de quem tem acesso ao curso. `is_correct`
-- nao esta na lista de colunas — nao por filtro de permissao, mas porque a
-- funcao simplesmente nao o seleciona.
--
-- A ordem das alternativas e embaralhada por tentativa? Nao. Ordem estavel e
-- mais facil de conferir com o aluno depois ("a alternativa B"), e embaralhar
-- nao impede cola nenhuma — quem quer colar tira print.

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

-- ---------------------------------------------------------------------------
-- 4. Corrigir — no banco, nunca no navegador
-- ---------------------------------------------------------------------------
-- `_respostas` chega como [{"question_id":"...","option_id":"..."}, ...].
-- Pergunta sem resposta conta como errada; nao trava a entrega, porque o
-- aluno que desistiu de uma questao ainda merece ver a nota.

-- Saidas com nomes proprios (`nota`, `aprovado`) e nao `score`/`passed`:
-- em PL/pgSQL parametro OUT homonimo de coluna usada no corpo vira
-- "column reference is ambiguous" em execucao, e nao na criacao da funcao.
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

  -- Teto de tentativas: contado ANTES de gravar, senao a ultima permitida
  -- seria recusada.
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

  -- Conta acerto por questao. O join com `course_exam_options` e o unico
  -- lugar do sistema onde `is_correct` e lido.
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

-- ---------------------------------------------------------------------------
-- 5. Gabarito comentado, so depois de responder
-- ---------------------------------------------------------------------------
-- Sem isto a prova so reprova; com isto ela ensina. Exige tentativa registrada:
-- ninguem ve o gabarito antes de tentar.

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

-- ---------------------------------------------------------------------------
-- 6. Certificado
-- ---------------------------------------------------------------------------
-- Regra de emissao, nesta ordem:
--   a) todas as aulas ativas com counts_for_certificate = true concluidas;
--   b) se o curso tem prova final ativa, uma tentativa aprovada nela.
--
-- Idempotente: chamar de novo devolve o mesmo certificado. Emitir dois para a
-- mesma pessoa no mesmo curso seria um bug com aparencia de recurso.

-- Os nomes de saida sao `codigo` e `emitido_em`, e NAO `code` / `issued_at`.
-- Em PL/pgSQL um parametro OUT com o mesmo nome de uma coluna usada nas
-- consultas do corpo faz o Postgres levantar "column reference is ambiguous"
-- em tempo de execucao — erro que nao aparece ao criar a funcao, so quando o
-- primeiro aluno tenta emitir. Nomes diferentes eliminam a classe do problema
-- em vez de depender de qualificar tudo certo para sempre.
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

  -- Idempotente: ja emitido devolve o mesmo, sem gerar outro codigo.
  select c.code, c.issued_at into v_code, v_issued
    from public.course_certificates c
   where c.student_id = v_student_id
     and c.digital_product_id = _digital_product_id;
  if v_code is not null then
    return query select v_code, v_issued;
    return;
  end if;

  -- (a) aulas que contam
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

  -- (b) prova final, se existir
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

  -- Codigo curto e legivel ao telefone: 12 caracteres hexadecimais.
  --
  -- Hex de proposito, e nao base32: o `encode` do Postgres so conhece base64,
  -- hex e escape — 'base32' estoura em tempo de execucao. E hex tem a
  -- propriedade que interessa aqui de graca: 0-9A-F nao contem I, L, O nem U,
  -- que sao justamente as letras confundidas com numero ao ditar por telefone.
  --
  -- `gen_random_uuid()` e nativo do Postgres 13+, entao isto nao depende da
  -- extensao pgcrypto estar instalada.
  --
  -- 48 bits de aleatoriedade. O laco existe porque a coluna e unica: colisao e
  -- improvavel, mas "improvavel" nao e "impossivel", e um erro de chave
  -- duplicada na cara de quem acabou de concluir o curso seria pessimo.
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

-- ---------------------------------------------------------------------------
-- 7. Conferir um certificado pelo codigo
-- ---------------------------------------------------------------------------
-- E o que da valor ao papel: um terceiro digita o codigo e ve se e verdadeiro.
--
-- DECISAO DE PRIVACIDADE, para nao ser reaberta por engano: devolve nome,
-- curso e data. Nao devolve e-mail, CPF, telefone nem id. Quem tem o codigo ja
-- recebeu o certificado da mao do aluno — o codigo E a autorizacao. Sem
-- codigo exato nao ha listagem: a funcao nunca devolve mais de uma linha e nao
-- aceita busca parcial.

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

-- ---------------------------------------------------------------------------
-- Conferencia depois de aplicar
-- ---------------------------------------------------------------------------
-- select proname from pg_proc where proname in
--   ('prova_para_responder','submeter_prova','gabarito_da_prova',
--    'emitir_certificado','verificar_certificado');
--
-- -- O teste que importa: aluno NAO pode ler o gabarito direto.
-- -- Logado como aluno, isto tem de voltar vazio ou negado:
-- select * from public.course_exam_options limit 1;
--
-- select polname, polcmd, polroles::regrole[] from pg_policy
--  where polrelid in ('public.course_exams'::regclass,
--                     'public.course_exam_questions'::regclass,
--                     'public.course_exam_options'::regclass,
--                     'public.course_exam_attempts'::regclass,
--                     'public.course_certificates'::regclass);
-- Espera-se {authenticated} em todas — NUNCA {public}.
