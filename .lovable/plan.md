## Diagnóstico revisado

Você tem razão: admin e coach são papéis independentes. Nathan **é coach** (tem linha em `coaches`, `commissions.beneficiary_profile_id`), com vendas reais. Consultando o banco agora:

- **Nathan (`nathan.utuari@gmail.com`)** → `wallets.available_balance = R$ 569,76` / `pending = R$ 102,71`. 80 comissões liberadas, 17 pendentes. **79 de 80 vinculadas a transações reais pagas**; 1 é fantasma (R$ 0,02, transação apagada).
- **Erick (`erickponcepereira@outlook.com`)** → `available = R$ 177,39` / `pending = R$ 14,26`. 2 comissões fantasma (R$ 0,58 + R$ 0,01).
- **Ana Flávia** → 1 comissão fantasma (R$ 0,03).

O que provavelmente aconteceu com o print do Nathan zerado ontem: a UI foi consultada **antes** da reconciliação global rodar (ou com cache antigo). O banco já está com o valor correto. Minha resposta anterior culpando "é admin, não coach" estava errada — o `getWalletSplit` não filtra por role, lê `wallets.available_balance` direto. Peço desculpas pelo diagnóstico incorreto.

## Comissões-fantasma encontradas

4 comissões apontam para a transação `2b5f9f5b-1824-...` que **não existe mais** em `transactions` (foi excluída, provavelmente teste antigo). Total inflado: **R$ 0,64** distribuído entre Erick (R$ 0,59), Nathan (R$ 0,02) e Ana Flávia (R$ 0,03). Valores pequenos, mas são exatamente o tipo de "dado fantasma" que você quer eliminar.

Auditoria global (234 comissões no total):
- 4 órfãs (sem `transaction_id` nem `partner_order_id` válidos) — as acima
- 0 vindas de transação marcada `is_test`
- 0 com beneficiário `is_test`

Nenhum fitcoin foi tocado — a limpeza é só em comissões monetárias.

## Ações

1. **Migração de limpeza de fantasmas**
   - `DELETE FROM commissions WHERE transaction_id IS NOT NULL AND transaction_id NOT IN (SELECT id FROM transactions) AND partner_order_id IS NULL` (remove as 4 órfãs).
   - `DELETE FROM commissions WHERE partner_order_id IS NOT NULL AND partner_order_id NOT IN (SELECT id FROM partner_product_orders) AND transaction_id IS NULL` (mesma regra para orders).
   - Rodar `admin_reconcile_all_wallets()` na mesma migração para reajustar saldos.

2. **Trigger preventiva de integridade** em `commissions`
   - `BEFORE INSERT`: exigir que pelo menos uma das FKs (`transaction_id` OU `partner_order_id`) exista de fato; caso contrário, rejeitar.
   - `ON DELETE` em `transactions` / `partner_product_orders`: `CASCADE` para `commissions` — quando a venda origem some, a comissão some junto (evita novos fantasmas se algum admin apagar transação de teste).

3. **Correção do texto/log de auditoria anterior**
   - Adicionar nota em `admin_reconcile_all_wallets()` para retornar por beneficiário: `{profile_id, name, role, wallet_available, commission_available_sum, delta, phantom_count}` para facilitar futura auditoria pelo painel.
   - Expor essa listagem no botão "Reconciliar carteiras" (Admin → Financeiro) já criado, mostrando linhas com `delta != 0` ou `phantom_count > 0`.

4. **Não mexer em Fitcoin**
   - `fitcoin_ledger` não entra na reconciliação; permanece intocado (regra que você reforçou).

5. **Verificação pós-migração** (retorno para você)
   - Print/tabela mostrando saldo antes/depois de Nathan, Erick, Ana Flávia e Neidelayne/José Eduardo (os 2 casos "R$ 40 sem carteira" da auditoria anterior — vou reclassificar: se a comissão veio de venda real, criar a linha em `wallets`; se veio de teste/fantasma, remover).

## Detalhes técnicos

- Todas as mudanças em SQL puro via migração; nenhuma alteração de UI necessária além do detalhe do retorno em Financeiro.
- Cascade em `transactions`→`commissions` é seguro porque hoje o app nunca "arquiva" transação paga — só apaga registros de teste.
- A trigger de integridade usa `SECURITY DEFINER` e roda em INSERT/UPDATE; não bloqueia comissões de fluxos reais porque `enqueue_commissions` sempre cria a transação antes.
