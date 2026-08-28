create or replace function public.parceiros_publicos_loja(_ids uuid[])
returns table(id uuid, fantasy_name text, city text, upline_coach_id uuid)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p.id, p.fantasy_name, p.city, p.upline_coach_id
    from public.partners p
   where p.id = any(_ids);
$$;

grant execute on function public.parceiros_publicos_loja(uuid[]) to anon, authenticated, service_role;

create or replace function public.profissionais_publicos(_ids uuid[])
returns table(coach_id uuid, nome text, cidade text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select c.id, pr.name, pr.city
    from public.coaches c
    join public.profiles pr on pr.id = c.profile_id
   where c.id = any(_ids);
$$;

grant execute on function public.profissionais_publicos(uuid[]) to anon, authenticated, service_role;