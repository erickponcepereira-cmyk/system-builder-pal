-- Correcao da localizacao — FitMind Club
-- 22/08/2026. Aplicar depois de 2026-08-22-localizacao.sql.
--
-- BUG que eu introduzi: produtos_por_local devolve uma linha POR PRODUTO.
-- Existem 1814 produtos ativos (242 de parceiro + 1572 de profissional) e o
-- PostgREST corta a resposta de funcao em 1000 linhas. Resultado medido em
-- producao: a RPC devolvia 1000 e Porto Velho ficava de fora do corte, ou seja,
-- a loja perderia silenciosamente ~45% do catalogo no filtro de cidade.
--
-- Correcao: devolver VENDEDOR -> cidade (cerca de 45 linhas) e cruzar no
-- cliente, que ja carrega o catalogo inteiro. Sem teto, sem truncamento, e
-- payload muito menor.

-- Nao serve mais e sai de circulacao para nao ser usada por engano.
drop function if exists public.produtos_por_local();

-- ---------------------------------------------------------------------------
-- Vendedores e suas cidades
-- ---------------------------------------------------------------------------
-- Devolve tipo + id do vendedor + cidade normalizada. A cidade de exibicao vem
-- padronizada pela grafia mais completa da mesma chave, para a tela nao mostrar
-- "Cuiaba" sem acento ao lado de "Cuiabá".
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
-- A versao anterior contava todo parceiro/profissional aprovado, inclusive quem
-- nao tem nada a venda. O seletor mostrava cidade que abriria vazia.
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

-- ---------------------------------------------------------------------------
-- Conferencia
-- ---------------------------------------------------------------------------
-- Quantas linhas a nova RPC devolve (tem que ser bem abaixo de 1000):
--   select count(*) from public.vendedores_por_local();
--
-- Cidades e quantos vendedores COM PRODUTO cada uma tem:
--   select * from public.cidades_com_loja();
--
-- O vendedor de Porto Velho tem produto ativo?
--   select v.nome, v.tipo, count(prp.id) as produtos
--   from public.vendedor_local v
--   left join public.professional_products prp
--     on prp.coach_id = v.vendedor_id
--    and prp.status = 'approved'
--    and prp.is_active_by_professional = true
--   where v.cidade_chave = 'porto velho'
--   group by v.nome, v.tipo;
