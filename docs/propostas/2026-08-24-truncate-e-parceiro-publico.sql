-- Duas pendências de segurança, respondidas — FitMind Club
-- 24/08/2026.
--
-- Ficaram abertas desde o incidente dos gratuitos. Este arquivo traz a
-- recomendação de cada uma, e o SQL de apenas UMA delas: a outra a
-- recomendação é NÃO fazer.

-- ===========================================================================
-- 1. TRUNCATE — recomendação: REVOGAR. É o SQL abaixo.
-- ===========================================================================
--
-- `anon` e `authenticated` têm TRUNCATE em tabelas do schema public. Isso não
-- é uma escolha de ninguém: é o padrão do Supabase, que faz
-- `GRANT ALL ON ALL TABLES IN SCHEMA public` — e ALL inclui TRUNCATE.
--
-- POR QUE IMPORTA MAIS QUE OS OUTROS PRIVILÉGIOS
--
-- INSERT, UPDATE e DELETE são contidos pela RLS: a policy decide linha a
-- linha. TRUNCATE **ignora RLS por definição** — não existe policy que o
-- limite. Uma tabela com TRUNCATE concedido é uma tabela que pode ser
-- esvaziada inteira, e RLS nenhuma impede.
--
-- POR QUE NÃO É PÂNICO
--
-- O PostgREST não expõe TRUNCATE por REST. Para explorar isso seria preciso
-- uma função que executasse SQL arbitrário, e não existe nenhuma. Ou seja: é
-- um privilégio parado, não um buraco aberto.
--
-- POR QUE MESMO ASSIM SE REVOGA
--
-- Porque o custo é zero e a proteção é permanente. Nada legítimo no app usa
-- TRUNCATE — quem apaga em massa é o service_role, que não passa por aqui.
-- Revogar não muda comportamento nenhum, e tira a tabela do alcance do dia em
-- que alguém adicionar, sem pensar, uma função que executa SQL dinâmico.

-- Primeiro OLHE, depois mude. Esta consulta mostra o tamanho real do assunto:
--
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and privilege_type = 'TRUNCATE'
--      and grantee in ('anon', 'authenticated')
--    order by table_name;
--
-- Se a lista vier com dezenas de tabelas, confirma o diagnóstico: é o padrão
-- do Supabase, e não algo que alguém concedeu de propósito.

begin;

revoke truncate on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;

-- Tabela nova nasce com o padrão de novo. Isto faz a revogação valer para as
-- próximas também — sem ele, o problema volta no próximo `create table`.
alter default privileges in schema public
  revoke truncate on tables from anon;
alter default privileges in schema public
  revoke truncate on tables from authenticated;

commit;

-- Conferência: a mesma consulta de cima deve voltar VAZIA.

-- ===========================================================================
-- 2. As três colunas de `partners` — recomendação: NÃO CONCEDER
-- ===========================================================================
--
-- A pergunta em aberto era se `authenticated` volta a ler `address`,
-- `whatsapp` e `public_whatsapp` direto da tabela. Minha recomendação é que
-- não, e o motivo não é medo: é que o caminho que a Lovable já construiu é
-- melhor que o GRANT.
--
-- `parceiro_publico` é security-definer. Ela decide, num lugar só, exatamente
-- quais campos saem — e mudar essa decisão depois é editar uma função. Com o
-- GRANT, o controle volta a ser "quais colunas cada tela pediu", espalhado por
-- todo o código, e qualquer logado (inclusive quem criou conta grátis agora)
-- lê contato de parceiro fazendo uma consulta direta.
--
-- O único custo real do caminho da RPC era desempenho: uma chamada por
-- parceiro. Com 41 parceiros, a aba de gratuitos fazia 41 idas ao servidor
-- onde antes fazia uma. Isso se resolve sem abrir nada — é a função abaixo.

-- ---------------------------------------------------------------------------
-- 2b. Versão em lote: uma chamada em vez de N
-- ---------------------------------------------------------------------------
-- Mesmos campos e mesma regra da `parceiro_publico`, recebendo vários ids.
-- Depois de aplicar, `loadPartnersById` passa a fazer uma chamada só.

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
     -- Só parceiro aprovado. Contato de parceiro pendente ou recusado não é
     -- informação pública, e a versão de um id só já pensa assim.
     and p.status = 'approved';
$fn$;

revoke execute on function public.parceiros_publicos(uuid[]) from public, anon;
grant  execute on function public.parceiros_publicos(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- O que NÃO aplicar
-- ---------------------------------------------------------------------------
-- Fica registrado para não ser reaberto por engano. Se um dia a decisão mudar,
-- que mude com o motivo escrito, e não por parecer mais fácil:
--
--   grant select (address, whatsapp, public_whatsapp)
--     on public.partners to authenticated;   -- NÃO
--
-- Além de reabrir o acesso direto, foi lista branca de coluna que derrubou a
-- aba de gratuitos: basta uma coluna fora da lista para o PostgREST recusar a
-- consulta INTEIRA, e o erro chega na tela disfarçado de lista vazia.
