revoke truncate on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;

alter default privileges in schema public
  revoke truncate on tables from anon;
alter default privileges in schema public
  revoke truncate on tables from authenticated;

create or replace function public.parceiros_publicos(_ids uuid[])
returns table (
  id               uuid,
  fantasy_name     text,
  photo_url        text,
  city             text,
  state            text,
  status           text,
  address          text,
  business_area    text,
  whatsapp         text,
  public_whatsapp  text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p.id, p.fantasy_name, p.photo_url, p.city, p.state, p.status,
         p.address, p.business_area, p.whatsapp, p.public_whatsapp
    from public.partners p
   where p.id = any(_ids)
     and p.status = 'approved';
$fn$;

revoke execute on function public.parceiros_publicos(uuid[]) from public, anon;
grant  execute on function public.parceiros_publicos(uuid[]) to authenticated;