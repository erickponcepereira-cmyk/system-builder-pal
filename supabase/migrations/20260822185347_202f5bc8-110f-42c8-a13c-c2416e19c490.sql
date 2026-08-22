-- Correcao da localizacao — FitMind Club
-- 22/08/2026. Aplicar depois de 2026-08-22-localizacao.sql.

-- Nao serve mais e sai de circulacao para nao ser usada por engano.
drop function if exists public.produtos_por_local();

-- ---------------------------------------------------------------------------
-- Vendedores e suas cidades
-- ---------------------------------------------------------------------------
create or replace function public.vendedores_por_local()
returns table (tipo text, vendedor_id uuid, cidade_chave text, cidade_exibicao text, uf text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with padrao as (
    select
      v.cidade_chave,
      v.uf,
      (array_agg(v.cidade_exibicao order by length(v.cidade_exibicao) desc))[1] as nome
    from public.vendedor_local v
    where v.cidade_chave is not null
    group by v.cidade_chave, v.uf
  )
  select v.tipo, v.vendedor_id, v.cidade_chave, coalesce(p.nome, v.cidade_exibicao), v.uf
  from public.vendedor_local v
  left join padrao p on p.cidade_chave = v.cidade_chave and p.uf is not distinct from v.uf;
$$;

grant execute on function public.vendedores_por_local() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- cidades_com_loja: contar VENDEDOR COM PRODUTO ATIVO, nao vendedor cadastrado
-- ---------------------------------------------------------------------------
create or replace function public.cidades_com_loja()
returns table (cidade_chave text, cidade_exibicao text, uf text, vendedores bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ativos as (
    select distinct 'partner'::text as tipo, pp.partner_id as vendedor_id
    from public.partner_products pp
    where pp.status = 'approved'
      and pp.is_active_by_partner = true
      and pp.deleted_at is null
    union
    select distinct 'professional'::text, prp.coach_id
    from public.professional_products prp
    where prp.status = 'approved'
      and prp.is_active_by_professional = true
  )
  select
    v.cidade_chave,
    (array_agg(v.cidade_exibicao order by length(v.cidade_exibicao) desc))[1],
    v.uf,
    count(*)
  from public.vendedor_local v
  join ativos a on a.tipo = v.tipo and a.vendedor_id = v.vendedor_id
  where v.cidade_chave is not null and v.uf is not null
  group by v.cidade_chave, v.uf
  order by count(*) desc;
$$;

grant execute on function public.cidades_com_loja() to anon, authenticated;
