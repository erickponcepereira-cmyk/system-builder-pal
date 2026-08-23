# Estado da loja nova e da área de membros

Documento de continuidade. Escrito em 22/08/2026 para que nada do que foi
descoberto ou construído se perca entre sessões.

Repositório de trabalho: `C:\dev\fitmind-bugs`, branch `main`.
Existe outra cópia em `C:\dev\fitmind` (`feat/mobile-shell`) — **não é a usada**.

---

## 1. Como verificar mudanças aqui

Isto poupa horas. O ambiente local tem armadilhas conhecidas.

**Type-check — este é o sinal válido:**

```
node node_modules/typescript/bin/tsc --noEmit
```

- `npx tsc` **não funciona**: baixa um pacote decoy do registro e imprime
  "This is not the tsc command you are looking for".
- A **linha de base é 15 erros pré-existentes**, todos em `src/lib/email-templates`,
  `src/routes/lovable/email` e no teste com `vitest`.
- Esses 15 **não são bugs**. Os pacotes `@react-email/*`, `vitest`,
  `@lovable.dev/email-js` e `@lovable.dev/webhooks-js` estão no `package.json`
  mas ausentes do `node_modules` desta máquina. No ambiente do Lovable estão
  instalados, e é por isso que o app compila e está no ar.
- **Qualquer erro fora desses arquivos é regressão sua.**

**Build (só quando precisar regenerar `routeTree.gen.ts`):**

```
cp vite.config.ts /tmp/vite.bak
sed -i 's/\[mcpPlugin()\]/[]/' vite.config.ts
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vite build
cp /tmp/vite.bak vite.config.ts        # NUNCA commitar o config alterado
```

- `mcpPlugin()` quebra o build no Windows (bug de separador de caminho).
- O build do **cliente** conclui; o estágio **SSR** falha em `@react-email/render`,
  que é a mesma ausência de pacote. Isso é esperado.
- **Cuidado:** não rode `git checkout -- src/routeTree.gen.ts` depois do build —
  isso reverte exatamente o que você queria gerar (já aconteceu).

**Arquivos são CRLF.** Substituição multi-linha por script precisa usar `\r\n`,
senão não casa. Substituição de linha única funciona normalmente.

**Banco:** o Supabase conectado via MCP (`ygixwjukmpdsnoilanoc`) **não é** o do
app (`myqyjifvrlwvesrwubsg`). Para inspecionar produção, use a API REST com a
chave anônima do `.env`. Distinção útil: coluna inexistente devolve `400`,
tabela inexistente devolve `404 PGRST205`, sem permissão devolve `401/42501`.

---

## 2. O que já está no ar

### Loja nova (`UnifiedStorePage`, 713 linhas) — ainda atrás do gate de teste

| Peça | Arquivo | Situação |
|---|---|---|
| Catálogo unificado (4 fontes) | `src/lib/unified-store.ts` | pronto |
| Busca sem acento + sinônimos | idem | pronto |
| Recomendação por regra | `src/lib/store-personalization.ts` | pronto |
| Localização por cidade | `src/lib/store-location.ts` | pronto |
| **Visibilidade (3 regras)** | `src/lib/store-visibility.ts` | pronto |
| Banner + popup do admin | `src/lib/store-banners.ts`, `StoreBanner.tsx` | pronto |
| Histórico de pedidos | `StoreOrders.tsx` | pronto |
| Admin de banners | `src/routes/_authenticated/admin.banners.tsx` | pronto |

### Área de membros — **em produção, sem gate**

| Peça | Arquivo |
|---|---|
| Motor de aulas (leitura, regras de liberação, progresso) | `src/lib/course-engine.ts` |
| Player com link assinado e marca d'água | `src/lib/course-playback.functions.ts`, `CoursePlayer.tsx` |
| "Meus cursos" | `src/components/store/MyCourses.tsx` → `/student/library` |
| Painel do criador com CRUD real | `CreatorCoursesPanel.tsx` |
| Card na Home | `student.index.tsx` |

### Conformidade — em produção

| Peça | Arquivo |
|---|---|
| Aceite de termos + cidade obrigatória | `src/lib/compliance-gate.ts`, `ComplianceGate.tsx` |
| Cidade nos 4 cadastros | `src/components/auth/CityField.tsx` |
| Gate das superfícies de teste | `src/lib/test-access.ts`, `TestSurfaceGate.tsx` |

### Rotas

- `/student/loja-teste`, `/coach/loja-teste` — loja nova (master admin)
- `/partner/cursos-teste`, `/professional/cursos-teste` — painel do criador (master admin)
- `/student/curso/$id` — player (**produção**)
- `/student/library` — Meus cursos (**produção**)
- `/admin/banners` — banners (permissão `store`)

---

## 3. Estado do banco — TUDO já aplicado

Verificado contra produção em 22/08/2026. Os sete arquivos em `docs/propostas/`
com data de 11 e 22 de agosto **já foram executados**:

- `digital_product_modules`, `digital_product_lessons`, `digital_lesson_progress` ✓
- `digital_product_lessons.thumbnail_key`, `.require_watermark` ✓
- `partner_created_courses` ✓
- `digital_products.included_for_active_coaches` ✓
- `product_downloads.digital_product_id` ✓
- `store_banners` (com 2 banners de exemplo ativos) ✓
- RPCs `cidades_com_loja`, `vendedores_por_local` ✓
- `produtos_por_local` corretamente **removida** ✓

**Não reaplique** esses arquivos. Eles ficam como registro do que foi feito,
porque `supabase/migrations/` é de outro responsável e as migrations foram
aplicadas pelo Lovable ou pelo editor do Supabase.

---

## 4. Descobertas que mudaram decisões

Cada uma custou investigação. Não redescubra.

### Loja

- **A loja nova não vende.** `UnifiedStorePage` não tem carrinho nem checkout.
  Grep confirmou zero ocorrências de `MercadoPagoCheckout`, `PurchaseSuccessModal`,
  `localStorage` e de todas as RPCs de pedido.
- **`StorePage.tsx` tem ~1854 linhas** e ainda opera com as duas abas
  (`storeTab: "fitmind" | "market"`).
- **Bug do carrinho multi-vendedor (produção):** `StorePage.tsx:678` pega
  `partnerItems[0]` e dá `return` **antes** de processar os itens FitMind.
  Carrinho com Protocolo + shake cobra só o shake. Já existe `planOrderSteps()`
  que calcula em quantos pedidos o carrinho vira, e a UI já avisa.
- **Causa estrutural:** cada RPC de parceiro cria **um pedido por produto**
  (cada um carrega a própria cadeia de comissão) e `MercadoPagoCheckout` recebe
  `source: { kind, id }` — **uma cobrança por pedido**. Não existe "juntar num
  pedido só" sem refazer o rateio.
- **`.limit(1000)` silencioso:** o catálogo descartava 572 dos 1572 produtos de
  profissional. Corrigido para 5000.
- **PostgREST corta resposta de função em 1000 linhas** e `Range` não fura esse
  teto. Foi por isso que a primeira versão de `produtos_por_local` perdia ~45%
  do catálogo. A correção foi devolver **vendedor → cidade** (~45 linhas).

### Localização

- **Produto não tem cidade.** Nem `partner_products` nem `professional_products`
  têm `city`. Local é propriedade do **vendedor**.
- **`partners.latitude/longitude` estão 100% nulas** (0 de 41). Não há raio nem
  distância possível. "Perto de mim" = "na minha cidade".
- **Profissional não tem cidade própria:** `coaches.city` não existe. O local
  dele está em `profiles.city`, fechado pela correção de segurança — por isso
  tudo passa por RPC security-definer.
- **Dado sujo:** Cuiabá aparecia em 3 grafias e Várzea Grande em 4. A
  normalização (dobra de acento + colapso de espaço) juntou tudo.
- **Distribuição atual:** Cuiabá 30, Várzea Grande 7, Porto Velho 1. Todos os
  parceiros em MT; o único de RO é uma profissional.

### Visibilidade — as três regras

Faltar qualquer uma é **vazamento de catálogo entre redes**, não falta de recurso.

1. `visibility_audiences` — espelha `StorePage.tsx:374-379`
2. Ocultações de seção/categoria/produto — espelha `StorePage.tsx:616-632`
3. `restrict_to_networks` + `allowed_coach_ids` + cadeia — espelha
   `PartnerProfessionalStore.tsx:495-501`

**Armadilha:** `mapStoreItemKind` devolve `null` para parceiro e profissional.
Usar `kind` deixaria todo produto deles **sem verificação de ocultação**. O
código usa `origin`, que é inequívoco.

### Modais

- **O bug do iPhone era geometria, não z-index.** O overlay é `fixed inset-0`
  (viewport de **layout**), mas `--vvh` é o viewport **visual**. Com as barras
  do Safari abertas o layout é mais alto, e centralizar dentro dele empurra o
  topo do cartão — onde fica o X — para fora da área visível.
- **Faltava `visualViewport.offsetTop`**, agora publicado como `--vvo` pelo
  script em `__root.tsx`. O overlay usa `top: var(--vvo)` + `height: var(--vvh)`.
- A safe-area era descontada **duas vezes**. O teto do cartão virou `max-height: 100%`.
- A correção é no sistema: **76 arquivos** que usam `ModalShell` ou `modal-safe`
  herdam.

### Cursos

- **`/student/library` existia e nenhum link do app apontava para ela.** Área de
  membros invisível. Agora tem card na Home.
- O motor de aulas do curso de formação (`coach_course_modules`) já existia e
  provou o padrão — as tabelas novas o generalizam.
- **Curso incluso na mensalidade:** coach adimplente **não tem linha em
  `digital_purchases`**. Por isso `can_view_digital_product` reaproveita
  `is_user_blocked_by_subscription`, que é a regra oficial de inadimplência.

### Segurança (histórico importante)

- A correção de RLS de 11/08 (revogar SELECT em `partners`) **derrubou o login
  do parceiro** em 22/08. Foi consertada pelo Lovable com a RPC `parceiro_do_dono`.
- **Não aplique** o `REVOKE ... partners FROM authenticated` que chegou a ser
  sugerido: quebraria de novo. O caminho certo é RPC security-definer.
- **Nunca consulte `profiles` de dentro de uma policy** — para anônimo isso
  estoura erro em vez de negar limpo. Use `is_admin()`, que é security definer.
- **Toda policy precisa de `TO` explícito.** Sem ele o Postgres aplica a `PUBLIC`,
  que inclui `anon` — foi essa a causa da exposição de dados bancários e CPF.
- `product_downloads` tem policy `FOR SELECT TO authenticated USING (true)`:
  qualquer logado lê `file_path`. **Armadilha a não repetir**, e ainda aberta.

---

## 5. Erros meus, registrados

Para quem continuar não repetir e para o histórico ser honesto.

1. **SQL do motor de aulas barrava parceiro.** `coach_owns_digital_product`
   resolvia o dono por `coach_created_courses → coaches`. Parceiro é a tabela
   `partners`, sem ligação nenhuma. Corrigido com `partner_created_courses` e
   `can_manage_digital_product`.
2. **Download da aula ficou aberto.** No seed deixei `allow_download` no padrão
   `true`, então `nodownload` nunca era aplicado — um vídeo de 133 MB foi baixado
   inteiro em teste. Agora vídeo **nunca** libera download.
3. **A primeira RPC de localização truncava.** Uma linha por produto, com 1814
   produtos e teto de 1000.
4. **Quase introduzi um vazamento:** a view `vendedor_local` junta `profiles`, e
   views rodam com privilégio do dono. Exposta pelo PostgREST, devolveria nome e
   cidade de todo profissional. Está revogada de `anon` e `authenticated`.
5. **Recomendei um REVOKE que teria quebrado o painel do parceiro** (item da
   seção de segurança acima).

---

## 6. O que falta

### Loja nova — o que impede a troca

Ordem sugerida. **A decisão do dono foi copiar de `StorePage`, não extrair**, para
não tocar no que está vendendo. Unificar depois, quando a nova provar-se.

1. **Carrinho** — estado, persistência em `localStorage`, add/remove/quantidade.
   **A chave não pode mudar:** `fitmind_cart_student` / `fitmind_cart_coach`. É
   ela que faz o carrinho sobreviver ao cadastro, ligando a loja pública à logada.
2. **Checkout** — copiar `checkoutAsStudent` (`StorePage.tsx:667-792`) e
   `checkoutAsCoach` (a partir de ~`:795`). Inclui frete, `ensureOrderNumber`,
   `payOrder`, `MercadoPagoCheckout`, `PurchaseSuccessModal` e limpeza por
   `paidItemIds`. **Levar junto `planOrderSteps` e o aviso de N pedidos.**
3. **Modo coach** — hoje `audience` só troca um rótulo. Falta seleção de aluno
   (`ClientPickerModal`), `COLUNAS_FINANCEIRAS` e histórico de vendas.
4. **Produto agendável** — `is_schedulable` é carregado e nunca usado. Falta
   `AvailabilityPicker` e o preflight que cancela agendamento anterior.
5. **Link de indicação** — botão de compartilhar e atribuição no pedido
   (`pendingReferrerStudentId`, `product_referral_rules`, `indicableProductIds`).
   Sem isso **perde-se comissão de indicação**.
6. **Deep link** — `?produto=<id>` e `?checkout=1` são validados só em
   `student.store.tsx`.
7. **Modal de detalhe** — o da loja nova é somente leitura. Falta galeria, faixa
   de preço, agendamento e botão de adicionar.

### Navegação (pedido, não iniciado)

- Loja como tela inicial do app do aluno.
- Home no **centro** da barra, um pouco maior.
- **Decisão já tomada:** Perfil sobe para o cabeçalho (já alcançável pelo
  seletor de painel), liberando o slot. Grátis, Agenda e Evolução **não saem** —
  são captação, eventos gratuitos e área personalizada.
- **Riscos mapeados:** 14 pontos usam `to="/student"` como "voltar ao início";
  10 apontam para `/student/store`; `post-auth-intent` gravado no navegador
  aponta para a loja por até 2h; `StudentLayout` expulsa admin/coach quando
  `fitmind_selected_area` não é `"student"`.

### Cursos

- **Provas e certificado** — não existe schema nem código. `CreatorCoursesPanel`
  admite isso na aba Provas.
- **Ebook com leitura protegida** — `allow_download=false` não tem visualizador.
  Não há dependência de PDF no `package.json`. O plano é rasterizar no servidor
  com marca d'água, para o PDF nunca chegar ao navegador.
- **`product_downloads.digital_product_id`** — coluna criada, **sem caminho de
  escrita nem de leitura**. `product-downloads.functions.ts` trata só três donos.
- **Upsell** — os três pontos (entrada, fim de módulo, aula não comprada) e o
  patrocinado com teto de 1 a cada 6 ainda não existem no player.
- **Vídeos antigos** estão em `formacao-coach/`, fora da convenção
  `<digital_product_id>/`. Continuam funcionando; só admin mexe.

### Pendências de infraestrutura

- **`types.ts` não foi regenerado.** As três tabelas do motor de aulas e as
  colunas novas não existem para o TypeScript — por isso os `as never` em
  `course-engine.ts` e `course-admin.ts`. Pedir ao Lovable.
- **R2** — bucket `fitmind-aulas` criado e vazio. **Decisão:** o vídeo começa no
  Supabase Storage, porque já existe o padrão de link assinado revisado em
  `product-downloads.functions.ts`. R2 fica para quando o volume justificar; a
  troca é mudar para onde `video_key` aponta.
- **`product_downloads` RLS** — `file_path` legível por qualquer logado. Aberto.

---

## 7. Decisões do dono, para não reabrir

- Gate das superfícies de teste por `profiles.is_master_admin` (Erick e Nathan).
- Carrinho multi-vendedor: **um pedido por vendedor por ora**; unificar numa
  cobrança só depois, com calma.
- Loja nova: **copiar** carrinho e checkout agora, unificar depois.
- Cursos aparecem na loja junto com o resto, **sem aba separada** — aba própria
  divide tráfego e mata venda cruzada.
- Banner: giro começa num banner diferente a cada visita.
- Popup: **uma vez por oferta**, fechar visível desde o primeiro instante.
- Vídeo nunca oferece download. A marca d'água **não impede gravação** — nada em
  navegador impede; ela identifica quem gravou, que é o que trava revenda.
- Nada de campo de religião: LGPD trata convicção religiosa como dado sensível.

---

## 8. Pontos em aberto

- **Termos:** os quatro PDFs de adesão enviados são **byte a byte idênticos** aos
  publicados em 04/07. A versão foi para 2.0.0 e o re-aceite dispara, mas o texto
  que a pessoa lê é o mesmo. O único documento novo é o de Curadoria, publicado
  em `public/legal/`. Falta o advogado entregar os quatro termos com a cláusula
  cristocêntrica costurada.
- **Nathan tem `is_master_admin`?** Confirmado pelo dono, não verificado no banco.
- **Vídeos do curso subiram?** Não consegui confirmar (bucket privado, chave
  anônima). O player abriu na prática, então provavelmente sim.
- **Produtos com `restrict_to_networks` sem `allowed_coach_ids`** ficam escondidos
  de todos. Se algum sumir da loja nova, verificar isso antes de suspeitar do código.
