# Prompt para o Claude Code — revisão de layout da loja

Copie daqui para baixo. Anexe as imagens de referência junto.

---

Você vai revisar o layout da loja do FitMind Club (TanStack Start + React +
Tailwind + shadcn/ui + Supabase). O objetivo é uma vitrine mais funcional,
que estimule a compra e recomende produtos com base no que a pessoa já
consome. As imagens anexadas são a referência visual.

**Antes de escrever qualquer código, leia os arquivos abaixo.** Eles já
existem e a revisão precisa caber neles, não substituí-los.

## Onde olhar

### Loja logada (a principal)
- `src/components/student/StorePage.tsx` — **1690 linhas**, o coração. Já
  opera em três modos: aluno, `coachMode` e `audience`
  (student/coach/partner/professional, que filtra `visibility_audiences`).
  Não transforme isso em um quarto modo; se precisar de estrutura nova,
  extraia componentes.
- `src/components/store/ProductDetailModal.tsx` (449) — detalhe do produto
- `src/components/store/PartnerProfessionalStore.tsx` (937) — vitrine de
  parceiro e profissional
- `src/components/store/CategoryPicker.tsx` (72)
- `src/routes/_authenticated/student.store.tsx` (13) — só monta a página

### Loja pública (sem login)
- `src/routes/loja.tsx` (500)
- `src/lib/public-store.ts` (507) — camada de leitura
- `src/components/store/public/PublicProductModal.tsx` (121)
- `src/components/store/public/PublicCartDrawer.tsx` (94)
- `src/routes/produto.$id.tsx` (358) — permalink com Open Graph

### Checkout
- `src/components/payments/MercadoPagoCheckout.tsx` (523)
- `src/components/store/PurchaseSuccessModal.tsx` (182)

## Restrições que não podem ser violadas

**1. Cores só por variável CSS.** O projeto tem white label por tenant: os
temas vivem na tabela `brand_themes` e são aplicados em runtime via
`themeToCssVars()` em `src/lib/branding.ts`, que injeta `--background`,
`--foreground`, `--primary` e outros ~20 tokens. Há tenants ativos com
identidade própria (um deles rosa, modo claro). **Qualquer cor
hardcoded quebra o white label.** Use as classes Tailwind que mapeiam para
os tokens (`bg-background`, `text-foreground`, `bg-primary`), nunca
`bg-[#0B0707]` nem `text-white` fixo em superfície temática.

**2. Não mexa em `supabase/migrations/`.** Migrations são de outro
responsável. Se precisar de tabela, coluna, índice ou RPC, escreva a
proposta em `docs/propostas/` e siga com o front funcionando sem ela.

**3. Não traga colunas de custo para o cliente.** A query da vitrine é
propositalmente restrita. Nunca inclua no `select`: `cost`, `other_costs`,
`app_fee`, `app_fee_percentage`, `card_fee_percentage`,
`credit_fee_percentage`, `tax_percentage`, `commission_coach`,
`commission_level1..3`. Em `StorePage.tsx` existe a constante
`COLUNAS_FINANCEIRAS`, que só é incluída quando `coachMode` é true —
mantenha esse comportamento.

**4. A chave do carrinho não muda.** `fitmind_cart_student` (e
`fitmind_cart_coach` em coachMode). É o que faz o carrinho sobreviver ao
cadastro, ligando a loja pública à logada.

**5. `npx tsc --noEmit` não cobre `src/routes` neste projeto** — passa com
zero erro mesmo com import quebrado em rota. Valide com `npx vite build`.

**6. Rodar `vite dev` localmente exige comentar `mcpPlugin()` em
`vite.config.ts`** (bug de separador de caminho no Windows). Não commite
essa alteração.

## Recomendação de produtos — leia isto antes de projetar

Os dados de histórico existem:

- `store_orders` — `student_id`, `status`, `paid_at`, `total_amount`,
  `sale_channel`
- `store_order_items` — `order_id`, `product_id`, `product_kind`,
  `store_product_id`, `digital_product_id`, `title`, `quantity`
- `transactions` — `student_id`, `product_id`, `purchase_type`, `paid_at`
- `digital_purchases` — `student_id`, `digital_product_id`, `purchased_at`
- taxonomia: `store_sections` → `store_categories` → `store_subcategories`

**Não construa recomendação estatística.** A base tem ~107 usuários e
volume de pedidos na casa das centenas. "Quem comprou X também comprou Y"
precisa de milhares de transações para sair do ruído; nessa escala ela
produz correlação aleatória e recomenda coisa sem sentido, o que destrói
a confiança na seção mais rápido do que não ter seção nenhuma.

Use regras determinísticas, nesta ordem de prioridade:

1. **Renovação / recompra** — produtos com `duration_days` ou
   `card_access_days` que estão vencendo. É a recomendação com maior taxa
   de conversão e a mais fácil de acertar.
2. **Mesmo coach** — o aluno já tem relação com o coach dele; o que esse
   coach vende converte mais.
3. **Mesma seção/categoria do que já comprou** — afinidade de conteúdo.
4. **Complementar por tipo** — comprou plano, sugere serviço; comprou
   serviço, sugere produto de parceiro.
5. **Parceiro na mesma cidade** — `partners.city` / `state` existem.

Sempre exclua o que a pessoa já tem. Recomendar algo já comprado é o erro
mais visível possível.

**A alavanca de conversão mais forte já existe e está subutilizada:** a
carteirinha. Aluno sem carteirinha ativa não consegue resgatar os
gratuitos dos parceiros, e o app hoje mostra isso como um aviso passivo.
Transformar em chamada — "R$ X em benefícios liberam com sua carteirinha"
— usa dado que já está no banco (`estimated_value` dos gratuitos ativos).

## Funil de três degraus — a mensagem tem que ser honesta

1. **Navegar** — grátis, sem conta
2. **Criar conta** — grátis, ativa o app e vincula ao coach que acompanha
3. **Ativar carteirinha** — primeira compra, libera usar os gratuitos

Não escreva que "tudo ativa ao se cadastrar". Não é verdade: a pessoa
cadastra, tenta resgatar um gratuito, não consegue, e abre chamado. O
texto correto já está em `src/routes/produto.$id.tsx`, use como referência.

## Problemas conhecidos do layout atual

- A navegação é drill-down de três níveis (seção → categoria →
  subcategoria). Para quem conhece funciona; para tráfego frio parece uma
  tela de pastas vazias. A loja precisa **abrir com produto na cara**:
  destaques e recomendados primeiro, taxonomia depois para quem quiser
  navegar.
- `professional_products` é carregado em loop paginado de 1000 em 1000 no
  cliente. Numa página pública isso é um primeiro paint ruim.
- `StorePage.tsx` com 1690 linhas e três modos já está no limite do
  gerenciável. Prefira extrair componentes a adicionar condicionais.

## Entrega

Comece propondo a estrutura da nova vitrine em texto — hierarquia de
seções, o que aparece acima da dobra, onde entram os recomendados — e
pare para eu revisar antes de implementar. Depois implemente em etapas,
começando pela loja logada.
