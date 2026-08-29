# Pontos: regra única (taxa de sistema ÷ 2) e correção dos lançamentos errados

## Regra confirmada

- Quem ganha ponto é o **coach titular do aluno** (o mesmo dono da comissão), nunca o master coach da venda cruzada.
- Valor: **1 ponto a cada R$ 2,00 de taxa de sistema**, arredondando para baixo (abaixo de R$ 2,00 = 0).
- Vale para tudo: loja (produtos do catálogo), produtos de parceiro e de profissional.

## O que está errado hoje (verificado no banco)

1. **Benefício vai para o vendedor, não para o titular.** Nos pedidos de parceiro/profissional os pontos são lançados para `selling_coach_id` no momento do pagamento. Nos dois pedidos de R$ 1.300 da Gabi Litran (PP-D38D35CB e PP-BBDD2EDD) os 45 + 45 pontos ficaram com a Vimark/Vanessa, embora o titular já tenha sido corrigido para a Mari.
2. **Loja usa pontuação fixa por produto.** Nas vendas de catálogo o ponto vem de `points_per_sale` do produto (hoje há produtos com 1, 2, 3, 4, 10, 30, 60 e 100 pontos) e, quando está zerado, o sistema dá 1 ponto "de consolo". Nada disso olha a taxa de sistema — é daí que vem a impressão de pontuação inflada/desigual.
3. **Duas vendas idênticas de R$ 1.300 para a mesma aluna** (PP-D38D35CB e PP-BBDD2EDD, pagas com 26 minutos de diferença) geraram 45 pontos cada. Se a segunda for teste/duplicidade, os 45 pontos dela também precisam sair.

## Correção proposta

1. **Regra única no banco**
   - `grant_partner_product_perks`: lançar os pontos para o coach titular do pedido (`selling_coach_id` já corrigido; quando houver venda cruzada de master, usar o `titular_coach_id` do metadata), mantendo `taxa ÷ 2`.
   - `process_paid_transaction`: substituir `points_per_sale` por `taxa de sistema da venda ÷ 2`, usando a soma dos slots marcados como taxa de sistema (mesmo valor creditado na carteira do sistema). Sem taxa de sistema, zero ponto — acaba o "mínimo 1".
   - Manter a reversão existente (`revert_transaction_points`) coerente com o novo cálculo.

2. **Front-end**: `src/lib/financialEngine.ts` ainda tem `calculatePointsFromSystemFee` com a fórmula antiga (`floor(taxa/20)*10`). Passa a usar a mesma regra de `computeSystemFeePoints` (taxa ÷ 2) para simulações e telas de comissão baterem com o extrato.

3. **Acerto do histórico (só o que está errado)**
   - Recalcular cada lançamento de `coach_points_log` comparando com a regra nova: corrigir o coach beneficiário quando divergir do titular e corrigir o valor quando divergir de `taxa ÷ 2`; remover lançamentos de pedidos cancelados/duplicados.
   - Depois, regravar `coaches.total_points`, `monthly_rankings`, `career_plan_progress` e `career_challenge_progress` a partir do log corrigido (esses três hoje são somados incrementalmente e ficaram com resíduo).
   - Relatório final em SQL: quem perdeu, quem ganhou e quantos pontos, para conferência.

4. **Pendência a confirmar antes de rodar o acerto**: a segunda venda de R$ 1.300 da Gabi (PP-BBDD2EDD) é duplicidade? Se sim, ela sai também das comissões, tickets e pontos.

## Validação

- Pedido PP-D38D35CB: 45 pontos na Mari, zero na Vanessa.
- Uma venda de loja com taxa de sistema R$ 6,17 passa a dar 3 pontos (hoje daria o fixo do produto).
- `coaches.total_points` de cada coach = soma do seu `coach_points_log`.
