# Corrigir o extrato de pagamentos do Fernando (co-produção não descontada)

## O que verifiquei nos dados reais

Produto "Aulão de Jump" (Fernando, parceiro) tem co-produção **aceita de 50% do líquido** para o profissional Leandro. Nas 26 vendas pagas:

- Líquido do criador somado: **R$ 516,33** (≈ R$ 19,86 por venda)
- Repasse de co-produção lançado para o Leandro: **R$ 258,29**
- Carteira de parceiro do Fernando: disponível R$ 9,94 / pendente R$ 248,10 / **total R$ 258,04 — correto** (já com o desconto)
- Carteira profissional do Leandro: **R$ 258,29 — correto**

Ou seja: **as carteiras estão certas; o relatório é que está errado.** A aba de Pagamentos do admin (`src/lib/admin-payouts.functions.ts`) monta as linhas e os totais de "Produto criado" direto do `partner_net_amount` de cada pedido, sem descontar o repasse de co-produção e sem somar os créditos recebidos como co-produtor. Por isso aparecem 26 linhas de R$ 19,89 e o total "Produto criado: R$ 516,33", divergindo do saldo real de R$ 258,04.

Fernando é o único criador com co-produção ativa hoje, e Leandro o único co-produtor — então o impacto direto é só nesses dois, mas a fórmula errada vale para qualquer produto com co-produção daqui pra frente.

## Correção

1. **Extrato por pessoa (aba Pagamentos)**: para cada pedido de produto criado, mostrar o valor **líquido do criador já descontado** o repasse de co-produção, com o rótulo indicando o percentual (ex.: "Produto criado · −50% co-produção"). Quando a pessoa é a co-produtora, incluir a linha de **crédito recebido** (hoje ela nem aparece no extrato).
2. **Totais/KPIs da aba e do dashboard de pagamentos**: recalcular "Produto criado" e os agregados de "a receber" usando o mesmo desconto/crédito, para bater exatamente com o saldo da carteira.
3. **Conferência de consistência geral**: rodar uma auditoria comparando, para todos os donos de carteira (coach, parceiro e profissional), o saldo gravado com o recálculo da regra oficial, e reconciliar as que divergirem. Reportar a lista das que foram ajustadas.
4. Manter as regras financeiras do banco como estão — a mudança é de relatório, não de cálculo de comissão.

## Detalhe técnico

- `src/lib/admin-payouts.functions.ts`: nas três consultas de `partner_product_orders` (dashboard, resumo e extrato detalhado), fazer join com `product_coproduction_credits` + `product_coproductions` por `order_id`, subtraindo o crédito quando a pessoa é `creator` e somando quando é `collaborator`, com a mesma regra de liberação de 7 dias já usada em `recalc_wallets_for_owner`.
- `src/routes/_authenticated/admin.payments.tsx`: novo rótulo/linha para os itens de co-produção.
- Auditoria: consulta comparando `wallets`/`partner_wallets`/`professional_wallets` com o recálculo, seguida de `admin_reconcile_all_wallets` apenas se houver divergência.

## Validação

- Extrato do Fernando: 26 linhas de ~R$ 9,93, total "Produto criado" R$ 258,04, batendo com a carteira (9,94 disponível + 248,10 pendente).
- Extrato do Leandro: 26 linhas de crédito de co-produção, total R$ 258,29, batendo com a carteira profissional.
- Nenhuma outra carteira com divergência após a auditoria.
