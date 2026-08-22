-- Localizacao real da loja — FitMind Club
-- 22/08/2026. Aplicar no editor do Supabase (ou pelo Lovable, como o anterior).
--
-- PROBLEMA REAL (verificado no banco de producao em 22/08):
--   1. Produto nao tem local. Nem partner_products nem professional_products tem
--      city/state/latitude/longitude. Local e propriedade do VENDEDOR.
--   2. Parceiro tem partners.city, mas escrito de 3 jeitos para Cuiaba
--      ("Cuiabá", "Cuiabá " com espaco duplo, "Cuiaba") e 4 para Varzea Grande.
--      Filtro por igualdade mostraria 20 de 29 parceiros em Cuiaba.
--   3. Profissional NAO tem local proprio: coaches.city nao existe. O local dele
--      esta em profiles.city/state — que a correcao de seguranca fechou para anon.
--      Por isso a Loureane, de Porto Velho, aparece em Cuiaba.
--   4. latitude/longitude existem em partners mas estao 100% nulas (0 de 41).
--      Entao NAO da para fazer raio/distancia hoje. Filtro e por cidade.
--
-- ESTRATEGIA: uma RPC security-definer que devolve o local canonico de cada
-- vendedor. Nao mexe em grant de coluna — foi exatamente isso que derrubou o
-- login do parceiro em 22/08 e precisou da parceiro_do_dono para consertar.
-- A RPC expoe SO cidade e UF normalizadas. Nunca endereco, CEP nem coordenada.

-- ---------------------------------------------------------------------------
-- 1. Normalizacao de cidade
-- ---------------------------------------------------------------------------
-- Dobra acento, colapsa espaco, caixa baixa. "Cuiabá ", "Cuiaba" e "Cuiabá"
-- viram a mesma chave. Usada para AGRUPAR, nunca para exibir.
create or replace function public.normaliza_cidade(_texto text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(
    regexp_replace(
      lower(translate(coalesce(_texto,''),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
      '\s+', ' ', 'g'
    ),
  '');
$$;

-- ---------------------------------------------------------------------------
-- 2. Local canonico por vendedor
-- ---------------------------------------------------------------------------
-- Um lugar so para perguntar "onde fica quem vende isto".
-- Parceiro -> partners.city/state
-- Profissional -> profiles.city/state do coach dono
-- FitMind -> sem local (nacional)
create or replace view public.vendedor_local as
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

-- ---------------------------------------------------------------------------
-- 3. RPC: cidades que tem loja, para montar o seletor
-- ---------------------------------------------------------------------------
create or replace function public.cidades_com_loja()
returns table (cidade_chave text, cidade_exibicao text, uf text, vendedores bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    v.cidade_chave,
    -- exibe a grafia mais frequente, para nao mostrar "Cuiaba" sem acento
    (array_agg(v.cidade_exibicao order by length(v.cidade_exibicao) desc))[1],
    v.uf,
    count(*)
  from public.vendedor_local v
  where v.cidade_chave is not null and v.uf is not null
  group by v.cidade_chave, v.uf
  order by count(*) desc;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: local do vendedor de cada produto
-- ---------------------------------------------------------------------------
-- A loja chama isto uma vez e cruza em memoria com o catalogo que ja carrega.
-- Devolve so id do produto + cidade/uf. Nenhum dado pessoal.
create or replace function public.produtos_por_local()
returns table (produto_id uuid, origem text, cidade_chave text, cidade_exibicao text, uf text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- nao devolve nome do vendedor: a loja ja tem isso do catalogo
  select pp.id, 'partner'::text, v.cidade_chave, v.cidade_exibicao, v.uf
  from public.partner_products pp
  join public.vendedor_local v on v.tipo = 'partner' and v.vendedor_id = pp.partner_id
  where pp.status = 'approved'
    and pp.is_active_by_partner = true
    and pp.deleted_at is null
  union all
  select prp.id, 'professional'::text, v.cidade_chave, v.cidade_exibicao, v.uf
  from public.professional_products prp
  join public.vendedor_local v on v.tipo = 'professional' and v.vendedor_id = prp.coach_id
  where prp.status = 'approved'
    and prp.is_active_by_professional = true;
$$;

-- ---------------------------------------------------------------------------
-- IMPORTANTE: trancar a view.
-- ---------------------------------------------------------------------------
-- View no Postgres roda com privilegio do DONO por padrao (security_invoker off).
-- Como vendedor_local junta profiles, deixa-la exposta pelo PostgREST devolveria
-- nome e cidade de todo profissional para anon — furando justamente os grants
-- que a correcao de seguranca de 11/08 fechou. Foi esse tipo de descuido que
-- derrubou o login do parceiro em 22/08.
--
-- A view existe so para as RPCs abaixo lerem. Ninguem a consulta direto.
revoke all on public.vendedor_local from anon, authenticated;

-- As RPCs sao o unico caminho, e devolvem apenas cidade e UF.
-- Nunca endereco, CEP, coordenada, telefone ou nome de pessoa fisica.
grant execute on function public.cidades_com_loja()  to anon, authenticated;
grant execute on function public.produtos_por_local() to anon, authenticated;
grant execute on function public.normaliza_cidade(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Diagnostico: quem esta sem local (rode e me mande)
-- ---------------------------------------------------------------------------
-- Vendedores sem cidade — sao os que nunca vao aparecer em filtro nenhum:
--
-- select tipo, nome, cidade_exibicao, uf
-- from public.vendedor_local
-- where cidade_chave is null or uf is null
-- order by tipo, nome;
--
-- Quantos produtos ficam invisiveis por causa disso:
--
-- select origem, count(*) from public.produtos_por_local()
-- where cidade_chave is null group by origem;
--
-- Conferir se a Loureane aparece com Porto Velho:
--
-- select * from public.vendedor_local where nome ilike '%lourean%';
