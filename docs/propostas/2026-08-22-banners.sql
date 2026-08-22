-- Banners e popup da loja, configuráveis no admin — FitMind Club
-- 22/08/2026.
--
-- Hoje o banner da loja é derivado do catálogo por regra (destaque, desconto,
-- curso). Funciona sem cadastro, mas não deixa você escolher a arte nem o
-- destino. Esta tabela dá esse controle sem perder o comportamento atual: se
-- não houver banner cadastrado e ativo, a loja volta a derivar do catálogo.

create table if not exists public.store_banners (
  id           uuid primary key default gen_random_uuid(),

  -- 'banner' aparece na faixa do topo; 'popup' abre sobre a loja.
  kind         text not null default 'banner' check (kind in ('banner','popup')),

  title        text not null,
  subtitle     text,
  -- Etiqueta curta sobre a arte: "50% OFF", "Novo", "Últimas vagas".
  badge        text,
  image_url    text,

  -- Destino. link_url guarda rota interna ("/student/library") ou endereço
  -- completo. O admin oferece um seletor de produto que preenche isto, para
  -- não exigir que alguém decore caminho.
  link_url     text,
  link_label   text,

  is_active    boolean not null default true,
  sort_order   integer not null default 0,

  -- Agendamento. Nulo dos dois lados = sempre no ar.
  starts_at    timestamptz,
  ends_at      timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_store_banners_ativo
  on public.store_banners (kind, is_active, sort_order);

alter table public.store_banners enable row level security;

-- Leitura: qualquer visitante vê banner ativo e dentro da janela de data.
-- É material de marketing, feito para ser visto — inclusive na loja pública.
-- TO explícito, como toda policy deve ter desde o incidente de 11/08.
create policy store_banners_public_read on public.store_banners
for select to anon, authenticated
using (
  is_active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at   is null or ends_at   >  now())
);

-- Escrita: só admin. is_admin() é security definer e não consulta profiles
-- direto de dentro da policy — foi esse padrão que derrubou o login do
-- parceiro em 22/08 e precisou da parceiro_do_dono para consertar.
create policy store_banners_admin_write on public.store_banners
for all to authenticated
using      (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Exemplos, para a tela nascer com algo (edite ou apague no admin)
-- ---------------------------------------------------------------------------
insert into public.store_banners (kind, title, subtitle, badge, link_url, link_label, sort_order)
values
  ('banner', 'Formação de Coach FitMind',
   'Incluída na sua mensalidade. Comece agora.',
   'Curso', '/student/library', 'Assistir', 1),
  ('banner', 'Gratuitos dos parceiros',
   'Ative a carteirinha e resgate na sua cidade.',
   'Grátis', '/student/freebies', 'Ver gratuitos', 2)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Conferencia
-- ---------------------------------------------------------------------------
-- select kind, title, badge, link_url, is_active, sort_order
-- from public.store_banners order by kind, sort_order;
--
-- Nenhuma policy pode aparecer com {public}:
-- select polname, polroles::regrole[] from pg_policy
-- where polrelid = 'public.store_banners'::regclass;
