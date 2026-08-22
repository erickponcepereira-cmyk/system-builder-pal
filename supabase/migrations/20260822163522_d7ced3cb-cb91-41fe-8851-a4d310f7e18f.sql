create or replace function public.normaliza_cidade(_texto text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(
    trim(
      regexp_replace(
        lower(translate(coalesce(_texto,''),
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
        '\s+', ' ', 'g'
      )
    ),
  '');
$$;

-- Recria a view para garantir que usa a nova normalização e fica com security_invoker on.
drop view if exists public.vendedor_local;

create or replace view public.vendedor_local with (security_invoker = on) as
  select
    'partner'::text                       as tipo,
    pa.id                                 as vendedor_id,
    pa.fantasy_name                       as nome,
    pa.city                               as cidade_exibicao,
    public.normaliza_cidade(pa.city)      as cidade_chave,
    upper(nullif(trim(pa.state), ''))     as uf
  from public.partners pa
  where pa.status = 'approved'
  union all
  select
    'professional'::text,
    c.id,
    pr.name,
    pr.city,
    public.normaliza_cidade(pr.city),
    upper(nullif(trim(pr.state), ''))
  from public.coaches c
  join public.profiles pr on pr.id = c.profile_id
  where c.is_professional = true and c.approved_at is not null;

-- Mantém a view inacessível diretamente; só as RPCs security-definer a leem.
revoke all on public.vendedor_local from anon, authenticated;

grant execute on function public.cidades_com_loja()  to anon, authenticated;
grant execute on function public.produtos_por_local() to anon, authenticated;
grant execute on function public.normaliza_cidade(text) to anon, authenticated;