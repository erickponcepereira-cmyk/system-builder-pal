-- Criacao de curso por parceiro e profissional — FitMind Club
-- 23/08/2026. Aplicar no SQL editor do Supabase, depois de
-- 2026-08-11-motor-de-aulas.sql e 2026-08-22-motor-de-aulas-correcoes.sql.
--
-- PROBLEMA QUE ISTO RESOLVE
--
-- O painel de cursos monta modulos e aulas, mas o curso em si nao nasce nele:
-- a tela diz "o curso e criado como produto digital e vinculado a voce pela
-- FitMind". A razao e a RLS de `digital_products`, que hoje tem exatamente
-- duas policies:
--
--   digital_products_admin_all    FOR ALL     USING (is_admin(auth.uid()))
--   digital_products_read_active  FOR SELECT  TO authenticated USING (status = 'active')
--
-- Ou seja, para parceiro e profissional: nao pode inserir, nao pode editar, e
-- nem enxerga o proprio rascunho — porque rascunho nao esta 'active'.
--
-- DECISOES DESTE ARQUIVO
--
-- 1. Curso nasce 'draft' e NAO entra na loja sozinho. A loja le
--    status = 'active'; quem promove para 'active' continua sendo admin. Isso
--    espelha `partner_products`, que ja exige aprovacao — nao inventa um
--    caminho novo para dinheiro entrar na vitrine.
--
-- 2. Escrita passa por RPC security-definer, nao por policy de UPDATE aberta.
--    Uma policy `FOR UPDATE USING (can_manage(...))` deixaria o criador mudar
--    o proprio `status` para 'active' e se autopublicar. Preferi funcoes que
--    tocam so as colunas que o criador pode mesmo mudar, a mexer em permissao
--    por coluna — que foi o que quebrou a aba de gratuitos em 23/08.
--
-- 3. SELECT do proprio rascunho vira policy, porque leitura nao tem esse risco.

begin;

-- ---------------------------------------------------------------------------
-- 1. O criador enxerga o proprio curso, mesmo fora do ar
-- ---------------------------------------------------------------------------
-- Sem isto o painel fica vazio logo depois de criar: a linha existe, mas a
-- unica policy de leitura exige status = 'active'.
--
-- `TO authenticated` explicito: sem o TO, o Postgres aplica a policy a PUBLIC,
-- o que inclui `anon`. Foi essa omissao que expos dados bancarios em agosto.

drop policy if exists digital_products_creator_select on public.digital_products;
create policy digital_products_creator_select on public.digital_products
for select to authenticated
using (public.can_manage_digital_product(id));

-- ---------------------------------------------------------------------------
-- 1b. O profissional enxerga o proprio vinculo
-- ---------------------------------------------------------------------------
-- Assimetria real, que quase passou batido: `partner_created_courses` tem a
-- policy de dono `pcc_owner` (FOR ALL TO authenticated), mas
-- `coach_created_courses` so tem admin e uma leitura publica exigindo
-- status = 'active' AND approved_by_admin = true.
--
-- Consequencia pratica: o painel monta a lista lendo essas duas tabelas
-- (`course-admin.ts:listarCursosGeridos`). Sem esta policy, o PARCEIRO veria o
-- curso novo e o PROFISSIONAL nao veria nada — o curso existiria e sumiria da
-- tela de quem acabou de cria-lo.

drop policy if exists ccc_owner on public.coach_created_courses;
create policy ccc_owner on public.coach_created_courses
for all to authenticated
using (creator_coach_id in (
  select c.id from public.coaches c
  join public.profiles p on p.id = c.profile_id
  where p.user_id = auth.uid()
))
with check (creator_coach_id in (
  select c.id from public.coaches c
  join public.profiles p on p.id = c.profile_id
  where p.user_id = auth.uid()
));

-- ---------------------------------------------------------------------------
-- 2. Criar curso
-- ---------------------------------------------------------------------------
-- Descobre sozinha se quem chama e parceiro (tabela `partners`) ou coach /
-- profissional (tabela `coaches`, onde profissional e coach com
-- is_professional). Se for os dois, parceiro ganha — e a empresa que fatura.
--
-- Insere o produto e o vinculo de autoria na MESMA transacao. Curso sem
-- vinculo seria curso que ninguem consegue editar depois, nem o proprio autor:
-- `can_manage_digital_product` resolve o dono justamente por essas duas tabelas.

create or replace function public.criar_curso(
  _title       text,
  _description text default null,
  _price       numeric default 0,
  _cover_url   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_profile_id uuid;
  v_partner_id uuid;
  v_coach_id   uuid;
  v_product_id uuid;
begin
  if coalesce(btrim(_title), '') = '' then
    raise exception 'O curso precisa de um titulo.' using errcode = '22023';
  end if;

  if _price is null or _price < 0 then
    raise exception 'Preco invalido.' using errcode = '22023';
  end if;

  select id into v_profile_id from public.profiles where user_id = auth.uid();
  if v_profile_id is null then
    raise exception 'Perfil nao encontrado.' using errcode = '42501';
  end if;

  select id into v_partner_id from public.partners where profile_id = v_profile_id limit 1;
  if v_partner_id is null then
    select id into v_coach_id from public.coaches where profile_id = v_profile_id limit 1;
  end if;

  if v_partner_id is null and v_coach_id is null then
    raise exception 'So parceiro ou profissional pode criar curso.' using errcode = '42501';
  end if;

  insert into public.digital_products (title, description, price, type, status, cover_url)
  values (btrim(_title),
          nullif(btrim(coalesce(_description, '')), ''),
          _price,
          'digital_course',
          'draft',
          nullif(btrim(coalesce(_cover_url, '')), ''))
  returning id into v_product_id;

  -- `creator_commission_percentage` e NOT NULL SEM default em
  -- coach_created_courses (tem default 0 so em partner_created_courses).
  -- Omitir aqui derrubaria a criacao do profissional com erro de not-null —
  -- as duas tabelas nasceram em epocas diferentes e nao foram alinhadas.
  -- Zero e o valor de partida; o rateio real e definido na aprovacao.
  if v_partner_id is not null then
    insert into public.partner_created_courses
      (partner_id, digital_product_id, creator_commission_percentage)
    values (v_partner_id, v_product_id, 0);
  else
    insert into public.coach_created_courses
      (creator_coach_id, digital_product_id, creator_commission_percentage)
    values (v_coach_id, v_product_id, 0);
  end if;

  return v_product_id;
end;
$fn$;

revoke execute on function public.criar_curso(text, text, numeric, text) from anon;
grant  execute on function public.criar_curso(text, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Editar o proprio curso
-- ---------------------------------------------------------------------------
-- So o que o criador pode mesmo mudar. `status` e `type` ficam de fora de
-- proposito: status e aprovacao (item 4), e type decide onde o produto aparece
-- na loja.
--
-- `coalesce(_x, coluna)` faz argumento nulo significar "nao mexe", para a tela
-- poder salvar um campo sem reenviar todos.

create or replace function public.atualizar_curso(
  _digital_product_id uuid,
  _title       text default null,
  _description text default null,
  _price       numeric default null,
  _cover_url   text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.can_manage_digital_product(_digital_product_id) then
    raise exception 'Este curso nao e seu.' using errcode = '42501';
  end if;

  if _price is not null and _price < 0 then
    raise exception 'Preco invalido.' using errcode = '22023';
  end if;

  update public.digital_products
     set title       = coalesce(nullif(btrim(coalesce(_title, '')), ''), title),
         description = coalesce(_description, description),
         price       = coalesce(_price, price),
         cover_url   = coalesce(_cover_url, cover_url)
   where id = _digital_product_id;
end;
$fn$;

revoke execute on function public.atualizar_curso(uuid, text, text, numeric, text) from anon;
grant  execute on function public.atualizar_curso(uuid, text, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Enviar para aprovacao / voltar para rascunho
-- ---------------------------------------------------------------------------
-- O criador move entre 'draft' e 'pending_review'. Ninguem alem de admin chega
-- em 'active' — e e 'active' que a loja le.
--
-- A guarda do `in ('draft','pending_review')` no WHERE e o que impede um curso
-- ja no ar de ser puxado de volta por quem nao e admin.

create or replace function public.enviar_curso_para_aprovacao(_digital_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_aulas int;
begin
  if not public.can_manage_digital_product(_digital_product_id) then
    raise exception 'Este curso nao e seu.' using errcode = '42501';
  end if;

  -- Curso sem aula nenhuma nao deveria ocupar a fila do revisor.
  select count(*) into v_aulas
    from public.digital_product_lessons l
    join public.digital_product_modules m on m.id = l.module_id
   where m.digital_product_id = _digital_product_id;

  if v_aulas = 0 then
    raise exception 'Publique pelo menos uma aula antes de enviar para aprovacao.'
      using errcode = '22023';
  end if;

  update public.digital_products
     set status = 'pending_review'
   where id = _digital_product_id
     and status in ('draft', 'pending_review');
end;
$fn$;

create or replace function public.voltar_curso_para_rascunho(_digital_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.can_manage_digital_product(_digital_product_id) then
    raise exception 'Este curso nao e seu.' using errcode = '42501';
  end if;

  update public.digital_products
     set status = 'draft'
   where id = _digital_product_id
     and status in ('draft', 'pending_review');
end;
$fn$;

revoke execute on function public.enviar_curso_para_aprovacao(uuid) from anon;
grant  execute on function public.enviar_curso_para_aprovacao(uuid) to authenticated;
revoke execute on function public.voltar_curso_para_rascunho(uuid) from anon;
grant  execute on function public.voltar_curso_para_rascunho(uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Conferencia depois de aplicar
-- ---------------------------------------------------------------------------
-- select proname from pg_proc
--  where proname in ('criar_curso','atualizar_curso',
--                    'enviar_curso_para_aprovacao','voltar_curso_para_rascunho');
--
-- select polname, polcmd, polroles::regrole[]
--   from pg_policy where polrelid = 'public.digital_products'::regclass;
--
-- Espera-se a policy nova com {authenticated} — NUNCA {public}.
