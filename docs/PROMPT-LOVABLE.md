# Prompt para o chat da Lovable — 3 entregas

Copie tudo abaixo da linha divisória para a Lovable. Está escrito para ser
autossuficiente: ela não tem o contexto das nossas conversas.

Recomendo mandar **uma entrega por vez** e conferir antes de seguir para a
próxima. A Entrega 1 mexe em RLS, e erro de RLS não aparece na tela — aparece
como dado exposto. Já tivemos dois incidentes assim neste projeto.

---

Você vai trabalhar no FitMind Club (TanStack Start + Supabase). São três
entregas. Faça na ordem e **pare ao fim de cada uma** para eu conferir.

Antes de começar, leia estes arquivos do repositório, eles já contêm parte do
trabalho pronto:

- `docs/propostas/multi-unidade-parceiro.sql` — especificação completa do banco
  da Entrega 1, com tabela, funções, backfill e catálogo de permissões
- `src/lib/unidades-parceiro.ts` — camada de front da Entrega 1, já pronta
- `src/lib/branding.ts` — sistema de tema atual, que a Entrega 2 vai substituir
- `src/routes/_authenticated/partner.tsx` — painel do parceiro, 1715 linhas

## Regras que valem para as três entregas

1. **Nenhuma policy sem cláusula `TO`.** No Postgres, `CREATE POLICY ... USING
   (true)` sem `TO` vale para o papel `PUBLIC`, que inclui `anon`. Esse erro já
   causou dois vazamentos neste projeto: custo e comissão de 81 produtos, e
   e-mail de 51 usuários. Toda policy nova precisa de `TO authenticated` ou
   `TO anon, authenticated` explícito.

2. **Nunca use `select("*")` em consulta que chega ao navegador.** Liste as
   colunas. As proibidas fora da área logada de coach são: `cost`,
   `other_costs`, `app_fee`, `app_fee_percentage`, `card_fee_percentage`,
   `credit_fee_percentage`, `tax_percentage`, `commission_coach`,
   `commission_level1`, `commission_level2`, `commission_level3`, `coupon_code`.

3. **`npx tsc --noEmit` não cobre `src/routes` neste projeto.** Ele passa com
   zero erros mesmo com import quebrado em rota. Valide com `npx vite build`.

4. Não altere `supabase/migrations/` já existentes. Só crie migrations novas.

5. Não remova `partners.profile_id`. Outras telas dependem dele.

---

# ENTREGA 1 — Parceiro com múltiplas unidades

## Problema

Um dono tem 3 academias. Ele precisa ver as 3 num painel, transitar entre elas,
e dar a cada academia uma recepção com permissões que ele define uma a uma
(check-in, leitor de QR, número de visitantes liberados; produtos e carteira
bloqueados).

Hoje isso é impossível. Em `partner.tsx:147`:

```js
const { data: p } = await supabase.from("partners")
  .select("*").eq("profile_id", profile.id).maybeSingle();
```

Um perfil para um parceiro. Se o dono for `profile_id` das 3 academias, o
`maybeSingle()` **estoura** ao encontrar mais de uma linha.

## Decisões já tomadas — não mude

- Cada academia continua sendo **uma linha em `partners`**. O sistema já pensa
  por parceiro: `partner-checkin.$partnerId`, `student.partners.$partnerId`,
  pedidos, produtos. Três academias = três linhas.
- Produtos e carteira são **separados por academia**.
- Permissões são **granulares**, uma a uma. Não use presets fechados.

## 1.1 Banco

Aplique o que está em `docs/propostas/multi-unidade-parceiro.sql`. Resumindo:

- tabela `partner_members(partner_id, profile_id, papel, permissoes[])`, com
  `papel IN ('owner','manager','staff')` e `UNIQUE(partner_id, profile_id)`
- função `partner_pode(_partner_id uuid, _permissao text)`, `SECURITY DEFINER`,
  `STABLE`, que devolve true se o usuário logado é `owner` da unidade ou tem a
  permissão na allowlist
- função `minhas_unidades_parceiro()`, `SECURITY DEFINER`, que lista as
  unidades do usuário logado com papel e permissões
- RLS em `partner_members`

**O backfill da Parte 2 é obrigatório e roda junto, não depois.** Ele cria uma
linha `owner` para cada parceiro existente a partir do `profile_id` atual.
É isso que faz todo parceiro atual continuar enxergando uma unidade com todas
as abas, exatamente como hoje.

## 1.2 RLS — a parte que não pode ser pulada

Esconder aba em React é cosmético. A recepção com sessão válida continua
conseguindo `UPDATE` em `partner_products` ou ler a carteira pela API REST,
mesmo sem ver o botão.

Regra: **onde a policy hoje compara `partners.profile_id` com o perfil do
usuário, troque por `public.partner_pode(partner_id, '<permissao>')`.** Isso
preserva o dono (que virou owner no backfill) e passa a barrar a recepção no
banco.

Aplique em, no mínimo: `partner_products` (`products.editar`), tabelas de
gratuitos do parceiro (`freebies.editar`), tabelas da carteira do parceiro
(`wallet.ver`), e pedidos do parceiro (leitura por unidade). **Audite se há
outras** — a lista no arquivo não foi verificada exaustivamente.

## 1.3 Front

`src/lib/unidades-parceiro.ts` já existe e está pronto. Ele expõe
`carregarUnidades(perfilId)`, `pode(unidade, permissao)`,
`escolherUnidadeAtiva`, `lembrarUnidadeAtiva`, o catálogo `PERMISSOES` e os
rótulos em português `ROTULOS_PERMISSAO`. **Use esse módulo, não escreva outro.**

Ele já tem fallback: se a RPC não existir, devolve uma unidade como dono. Então
funciona antes e depois da migration.

No `partner.tsx`:

- troque a resolução do parceiro (linha ~147) por `carregarUnidades`
- se houver mais de uma unidade, mostre um **seletor no topo** (nome, cidade,
  foto). Trocar de unidade recarrega os dados do painel para aquele
  `partner_id`. Persista a escolha com `lembrarUnidadeAtiva`
- **filtre a lista de abas** (`baseTabs` / `tabs`, linha ~201) por permissão,
  usando `pode()`. O mapa aba → permissão está em `ROTULOS_PERMISSAO`
- se a unidade ativa não tem permissão para a aba atual, volte para a primeira
  aba permitida

## 1.4 Tela de permissões

Nova aba "Membros", visível só para quem tem `members.gerenciar`:

- lista os membros da unidade ativa com papel e permissões
- permite convidar por e-mail e criar a linha em `partner_members`
- para cada membro, uma lista de checkboxes com **todas** as chaves de
  `ROTULOS_PERMISSAO`, usando os rótulos em português
- `owner` não pode ter as permissões editadas nem ser removido pelo próprio
  dono da unidade — evite o cenário de a unidade ficar sem dono

## 1.5 Como eu vou conferir

- um parceiro que já existia continua vendo uma unidade e todas as abas
- criando 3 parceiros e 3 linhas `partner_members` para o mesmo perfil, o
  seletor aparece com as 3
- logado como recepção com só `scanner.usar` e `overview.ver`: vê 2 abas, e
  `PATCH /rest/v1/partner_products?id=eq.<id>` retorna 401 ou 403
- `SELECT tablename, policyname, roles FROM pg_policies WHERE schemaname='public'
  AND 'public' = ANY(roles);` não traz nenhuma policy nova

---

# ENTREGA 2 — White label por tabela

## Problema

`src/lib/branding.ts` tem os temas **hardcoded**. Há `CAROL_COACH_ID` e
`CAROL_PROFILE_ID` como UUIDs no código, e o tipo é fechado:
`BrandThemeKey = "fitmind" | "carol"`. Cada parceiro novo é alteração de código
e deploy. Isso não sustenta num SaaS.

## O que fazer

Mova os temas para o banco, mantendo o FitMind como padrão.

- tabela `brand_themes` com: `key` (texto único), `nome`, `mode`
  ('dark' | 'light'), `logo_full_url`, `logo_icon_url`, `favicon_url`,
  `theme_color`, e os tokens de cor. Os 24 tokens estão em `BrandTheme.tokens`
  no arquivo atual — use exatamente os mesmos nomes
- vínculo: `brand_theme_key` em `coaches` e em `partners`, nulo = tema FitMind
- leitura pública: o tema precisa ser lido **sem login**, porque a loja pública
  e o cadastro por indicação são anônimos. Policy `TO anon, authenticated` e
  `GRANT SELECT` por coluna. Não há nada sensível numa tabela de cores, mas
  declare explicitamente
- `resolveBrandTheme` passa a consultar a tabela, mantendo a mesma assinatura
  (`coachId`, `profileId`, `override`) para não quebrar quem já a chama
- `themeToCssVars` não muda

**Migre a Carol para linha na tabela e remova os dois UUIDs do código.** O tema
dela precisa continuar idêntico — fundo `#FFC1D8`, primária `#F53687`, modo
light. O perfil `erickpppjur@hotmail.com` está vinculado a ela e tem que
continuar rosa depois da mudança. Confira isso especificamente.

## Novo parceiro

Crie a linha do **Mutação Fitness**. Vou passar as cores e o logo; se ainda não
tiver recebido, deixe a linha criada com os tokens do FitMind e me avise para
eu preencher pelo painel.

Adicione no painel do parceiro uma seção de identidade visual, visível para
quem tem `profile.editar`, onde ele escolhe as cores e envia o logo. É esse o
ponto: o próximo parceiro entra sem alteração de código.

## Como eu vou conferir

- a Carol continua rosa, e o perfil vinculado a ela também
- criando um tema novo pelo painel, ele aplica sem deploy
- um usuário sem tema vinculado vê o FitMind escuro de sempre

---

# ENTREGA 3 — Aba de gratuitos pública

## Problema

Em `src/routes/_authenticated/student.freebies.tsx:303` existe um muro:

```jsx
) : !cardActive ? (
  <div>Sua carteirinha está inativa ...</div>
) : (
```

Sem carteirinha ativa, a pessoa vê **uma caixa de aviso e mais nada**. Não vê
nenhum brinde, patrocinador ou valor. É o maior desperdício de conversão do
app: o modelo de dados tem `sponsor_name`, `sponsor_avatar`, `location`,
`estimated_value`, `discount_percent` e `stock`, tudo escondido.

## O que fazer

Inverta o portão. Crie `/gratuitos`, rota **pública**, fora de
`_authenticated`, com SSR ligado (é o SSR que faz o link ter prévia no
WhatsApp).

- mostre **tudo**: nome, imagem, patrocinador, local, valor estimado
- troque só a **ação**. Onde hoje há "Resgatar", quem não tem carteirinha ativa
  vê "Ative sua carteirinha para resgatar"
- **a regra de negócio não muda**: para usar um gratuito continua sendo
  necessário ter carteirinha ativa, ou seja, ter comprado algo
- some `estimated_value` dos itens ativos e mostre no topo: "R$ X em benefícios
  disponíveis agora". É o argumento de conversão mais forte e o número já está
  no banco

As tabelas `freebies`, `partner_products` e `professional_products` já são
legíveis por `anon`. Os filtros corretos são `kind = 'free'` e
`status = 'approved'`, mais a flag de ativação de cada uma. **Não** use
`is_free`, essa coluna não existe.

## Mensagem — cuidado aqui

Não escreva que "tudo ativa quando se cadastra". Não é verdade e gera
reclamação: a pessoa cadastra, tenta resgatar, não consegue. A escada real tem
três degraus e cada um precisa de nome próprio:

1. **Navegar** — grátis, sem conta
2. **Criar conta** — grátis, ativa o app e vincula ao coach que acompanha
3. **Ativar a carteirinha** — primeira compra, libera usar os gratuitos

O mesmo texto já está em `src/routes/produto.$id.tsx`, use como referência.

## Como eu vou conferir

- em guia anônima, `/gratuitos` mostra os brindes com patrocinador e valor
- o botão de resgate pede carteirinha, e ninguém sem carteirinha consegue
  resgatar de fato
- `GET /rest/v1/freebie_redemptions` como anônimo volta vazio ou 401
