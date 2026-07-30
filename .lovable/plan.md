## Diagnóstico (confirmado nos dados)

A venda do **Aulão de Jump** (pedido `PP-7DF68F18`, pago em 30/07 16:28, bruto R$ 25,00, líquido R$ 19,89) **gerou sim o crédito de co-produção** do Leandro: existe um registro em `product_coproduction_credits` de **R$ 9,95** (50% do líquido), vinculado à co-produção aceita entre o parceiro criador e o profissional Leandro da Silva Amorim.

O problema é na etapa seguinte: a função que recalcula todas as carteiras (`recalc_wallets_for_owner`) **não lê a tabela `product_coproduction_credits` em momento nenhum**. Ela só soma comissões e o `partner_net_amount` dos pedidos. Como ela sobrescreve os saldos, o crédito do Leandro simplesmente desaparece — a carteira dele hoje mostra R$ 0,00 disponível e R$ 2,10 pendente (valor de outra origem).

Consequência dupla:
- O co-produtor nunca recebe.
- O criador do produto (parceiro) continua recebendo 100% do líquido, sem desconto da parte repassada.

## O que será feito

1. **Incluir os créditos de co-produção no cálculo das carteiras**
   Alterar `recalc_wallets_for_owner` para, além do que já faz:
   - **Somar** os créditos onde a pessoa é a colaboradora (`is_cost = false`), na carteira correta conforme o tipo (parceiro → carteira de parceiro; profissional/coach → carteira profissional).
   - **Somar** os reembolsos de custo (`is_cost = true`) para quem arcou com o custo.
   - **Descontar** do criador do produto o total repassado aos co-produtores naquele pedido, para o líquido não ser contado duas vezes.
   - Aplicar a mesma regra de liberação já usada nos pedidos de parceiro: fica **pendente por 7 dias** a partir do pagamento e depois vira disponível.
   - Considerar apenas créditos de pedidos com status pago (créditos de pedidos cancelados/estornados são ignorados).

2. **Reprocessar retroativamente**
   Rodar o recálculo para todos os envolvidos em co-produções já existentes (Leandro e o parceiro do Aulão de Jump, além da co-produção do produto profissional de 23/07), para os saldos ficarem corretos imediatamente.

3. **Visibilidade nos extratos**
   Fazer os lançamentos de co-produção aparecerem no histórico da carteira do co-produtor e no relatório do criador, identificados como "Co-produção — {nome do produto}" e "Repasse de co-produção", com o número do pedido.

## Detalhes técnicos

- Migração alterando `recalc_wallets_for_owner` (função central; todos os gatilhos já existentes passam a propagar a mudança).
- Junção de `product_coproduction_credits` com `partner_product_orders` para filtrar por `status = 'paid'` e usar `paid_at` como base da janela de 7 dias.
- O desconto no criador usa `creator_type`/`creator_id` de `product_coproductions`, limitado ao líquido do próprio pedido (nunca negativo).
- Nenhuma mudança no gatilho `apply_coproduction_credits_on_order` — ele já está correto.
- Ajustes de leitura nas funções de extrato/carteira do front (co-produtor e criador) para exibir os lançamentos.

## Validação

- Conferir que a carteira do Leandro passa a mostrar R$ 9,95 (pendente até 06/08, depois disponível).
- Conferir que a carteira do parceiro do Aulão de Jump cai de R$ 19,89 para R$ 9,94 referente a esse pedido.
- Rodar o recálculo geral e verificar que nenhum outro saldo muda indevidamente.
