begin;

drop policy if exists digital_products_creator_select on public.digital_products;
create policy digital_products_creator_select on public.digital_products
for select to authenticated
using (public.can_manage_digital_product(id));

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