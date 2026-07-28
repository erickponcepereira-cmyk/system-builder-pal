## Antes de tudo: dois arquivos citados não existem

Verifiquei o repositório e o banco:

- `docs/propostas/multi-unidade-parceiro.sql` — **não existe** (a pasta só tem `loja-publica-e-vazamento.sql`)
- `src/lib/unidades-parceiro.ts` — **não existe**

Então a "camada de front já pronta" e a "especificação do banco" precisam ser escritas nesta entrega, seguindo exatamente o contrato que você descreveu (`carregarUnidades`, `pode`, `escolherUnidadeAtiva`, `lembrarUnidadeAtiva`, `PERMISSOES`, `ROTULOS_PERMISSAO`). O restante da entrega segue como especificado.

O que confirmei no banco/código:

- `partner.tsx:147` usa mesmo `select("*") ... .eq("profile_id", profile.id).maybeSingle()` — estoura com 2+ linhas
- `partner_products` (owner insert/update/delete), `partner_visits`, `partners_owner_update`, `ppo_partner_select`, `partner_posts_owner_cud` estão hoje **sem cláusula `TO`** (roles = `{public}`) — vão ser recriadas com `TO authenticated`
- existe `public.current_partner_id()` que faz `LIMIT 1` sobre `partners` pelo `profile_id`. **Esse é o ponto crítico**: com 3 unidades no mesmo perfil ele passa a devolver uma unidade aleatória, e várias policies dependem dele (`partner_posts`, `partner_product_orders`, `partner_product_order_status_log`, `partner_coupons`). Precisa ser tratado nesta entrega.

---

## Entrega 1 — escopo

### 1.1 Migration nova (nada de editar migrations antigas)

**Tabela**

```
partner_members(
  id uuid pk,
  partner_id uuid -> partners(id) on delete cascade,
  profile_id uuid -> profiles(id) on delete cascade,
  papel text check in ('owner','manager','staff'),
  permissoes text[] default '{}',
  created_at, updated_at,
  unique(partner_id, profile_id)
)
```
Com `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, `GRANT ALL ... TO service_role`, RLS ligada.

**Funções (`SECURITY DEFINER`, `STABLE`, `search_path=public`)**

- `partner_pode(_partner_id uuid, _permissao text) returns boolean` — true se o usuário logado é `owner` da unidade, ou tem `_permissao` no array, ou é admin
- `minhas_unidades_parceiro()` — retorna `partner_id, fantasy_name, city, state, photo_url, status, papel, permissoes` das unidades do perfil logado
- `current_partner_ids() returns setof uuid` — **novo**, substitui o `LIMIT 1` nas policies existentes que hoje usam `current_partner_id()` (mantenho `current_partner_id()` viva para não quebrar chamadas espalhadas, mas ela passa a preferir a unidade `owner`)

**Backfill (na mesma migration)**: uma linha `owner` em `partner_members` para cada `partners.profile_id` não nulo.

**RLS de `partner_members`**: leitura para membros da própria unidade; escrita só para quem tem `members.gerenciar` naquela unidade (ou admin); bloqueio de alterar/remover linha `owner` por trigger.

Catálogo de permissões: `overview.ver`, `products.editar`, `freebies.editar`, `scanner.usar`, `wallet.ver`, `orders.ver`, `timeline.editar`, `reports.ver`, `members.gerenciar`, `profile.editar`, `agenda.ver`, `collab.ver`, `network.ver`, `store.ver`, `subscription.ver`.

### 1.2 RLS por permissão

Recriar (drop + create, sempre com `TO authenticated`) trocando `partners.profile_id = perfil do usuário` por `public.partner_pode(partner_id, '<permissao>')`:

- `partner_products` — insert/update/delete → `products.editar`; o select público aprovado permanece como está
- `partner_product_schedules` (gratuitos/horários) → `freebies.editar`
- `partner_freebie_reservations` (leitura do estabelecimento) → `scanner.usar` ou `freebies.editar`
- `partner_wallets` → `wallet.ver`
- `partner_product_orders` / `partner_product_order_status_log` (ramo do parceiro) → `orders.ver`, via `current_partner_ids()`
- `partner_posts` → `timeline.editar`
- `partner_visits`, `partner_coupons` (ramo parceiro) → por unidade, `TO authenticated`
- `partners_owner_update` → `profile.editar`

Auditoria: rodo `pg_policies` procurando toda referência a `current_partner_id()` ou `partners.profile_id` e corrijo o conjunto inteiro, não só a lista acima.

### 1.3 `src/lib/unidades-parceiro.ts` (criar)

Exporta `Unidade`, `PERMISSOES`, `ROTULOS_PERMISSAO`, `carregarUnidades(perfilId)` (RPC `minhas_unidades_parceiro`, com fallback para consulta direta em `partners` devolvendo papel `owner` com todas as permissões), `pode(unidade, permissao)`, `escolherUnidadeAtiva(unidades, lembrada)`, `lembrarUnidadeAtiva(partnerId)` via `localStorage`.

### 1.4 `partner.tsx`

- substituir a resolução do parceiro por `carregarUnidades`; carregar dados sempre pelo `partner_id` da unidade ativa
- seletor no topo (foto, nome fantasia, cidade) quando houver 2+ unidades; trocar recarrega e persiste
- `baseTabs`/`tabs` filtradas por `pode()`; se a aba ativa perder permissão, cai na primeira permitida
- trocar o `select("*")` de `partner_products` por lista explícita de colunas (o painel do parceiro é a própria loja dele, mas ainda assim listo colunas para não expor campos de comissão a uma recepção)

### 1.5 Aba "Membros"

Visível só com `members.gerenciar`. Lista membros da unidade ativa (nome, e-mail, papel), convite por e-mail (busca `profiles` por e-mail; se não existir, aviso para a pessoa se cadastrar antes), checkboxes com todas as chaves de `ROTULOS_PERMISSAO` em português, `owner` sem edição/remoção.

### 1.6 Validação

`npx vite build`, e no banco:
`SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND 'public' = ANY(roles);` — nenhuma policy nova, e as antigas de parceiro que eu tocar saem da lista.

Paro aqui para você conferir antes da Entrega 2.

---

## Sua pergunta: dono de 3 academias, como fica a rede

Respondendo agora porque isso muda o que eu escrevo na migration.

**Cadastros.** O dono tem **1 perfil (login)** e **3 linhas em `partners`** — uma por academia. Ele não precisa de 3 logins. O que liga o perfil dele às 3 é a nova `partner_members` com papel `owner` nas três. No painel ele troca de unidade pelo seletor.

**Vendas e carteira.** Cada venda pertence à academia onde foi feita: `partner_product_orders.partner_id` aponta para aquela unidade, e existe **uma `partner_wallets` por `partner_id`**, ou seja, 3 carteiras separadas. É o que você pediu ("produtos e carteira separados por academia"). Se você quiser saque consolidado depois, dá para somar as três na tela — mas o registro contábil continua por unidade, que é o certo para relatório por academia.

**MLM / upline.** Aqui está o ponto que você precisa validar. A rede **não** usa `partners`; ela usa `coaches.upline_coach_id`. A tabela `partners` tem `upline_coach_id`, mas isso é só "quem indicou este parceiro". Então, hoje:

- as 3 academias podem ter o mesmo `upline_coach_id` (quem indicou o dono)
- o dono, como pessoa, tem **um** registro de coach (um perfil = um coach). Ele não vira "upline 1 de si mesmo três vezes"

Ou seja: **o dono não fica como upline nível 1 das 3 academias no sentido de MLM** com a modelagem atual. As comissões de rede das vendas das 3 sobem para a linha do coach dono (e daí para o upline dele) — não passam por três nós intermediários. Na prática o dono recebe como vendedor/dono da unidade, e a rede acima dele recebe os 10/5/3.

Se o que você quer é diferente — que cada academia seja um **nó próprio de rede** com o dono como upline 1 delas — isso exige um perfil/coach separado por academia (3 logins) e não é o desenho desta entrega. Me diga qual dos dois você quer:

- **(A)** 1 login, 3 unidades, rede sobe direto pelo coach do dono — é o que vou implementar
- **(B)** 3 logins/coaches, dono como upline das 3 — vira outra modelagem, com impacto em comissões

Se você não responder, sigo com **(A)**.
