# Acertar o financeiro: um único saldo verdadeiro por pessoa

## 1. Desmarcar os 6 PEDAL NIGHT

Tirar a marcação de assinatura recorrente dos 6 produtos "PEDAL NIGHT" (R$ 35 a R$ 170) do parceiro: eles voltam a ser compra avulsa (PIX/cartão).

## 2. O que está errado no financeiro (verificado no banco, caso Ana Flávia)

Hoje existem quatro contas diferentes para a mesma pessoa, e nenhuma conversa com a outra:

| Onde aparece | Disponível | Pendente/Bloqueado | Total ganho | Sacado |
|---|---|---|---|---|
| Tabela de carteira (usada no saque) | R$ 0,00 | R$ 343,12 | R$ 575,61 | R$ 232,49 |
| Modal do admin | R$ 0,00 | R$ 619,46 | R$ 1.000,57 | R$ 238,47 |
| Aba "Comissões" do modal | R$ 375,13 | R$ 200,48 | — | — |
| Painel do coach (direto + rede) | R$ 40,00 | R$ 603,69 + R$ 158,41 | R$ 857,50 | — |

Conferindo comissão por comissão no banco, o correto para ela é:

- Comissões liberadas (data de carência já venceu): **R$ 375,13** — dessas, R$ 142,69 são de rede e continuam bloqueadas até bater a missão do mês, então **saque hoje = R$ 232,44**
- Comissões ainda em carência: **R$ 200,48**
- Total de comissões geradas: **R$ 575,61**
- Saques já pagos: **R$ 278,47** (4 pagamentos) — a carteira registra R$ 232,49 e o admin mostra R$ 238,47; os dois estão errados
- Carteira de indicação (aluno): R$ 40,00 à parte
- "Produto criado" (R$ 424,96) é receita de pedidos de produto dela, calculada só na hora de exibir no admin e somada ao "total ganho" lá, mas nunca entra na carteira

Causas confirmadas:

1. A linha de carteira guarda `pendente = ganho − sacado` e zera o disponível, em vez de separar comissões liberadas de comissões em carência.
2. O total sacado da carteira não bate com os saques efetivamente pagos.
3. Cada tela (admin, modal, painel do coach, saque) refaz a conta com regras próprias, incluindo ou excluindo rede bloqueada, indicação de aluno e receita de produto criado de formas diferentes.

## 3. Correção

Criar **uma única função no banco** que devolve, para qualquer pessoa, o extrato consolidado, sempre calculado a partir dos lançamentos reais (comissões, pedidos de produto criado, saques):

- A liberar (em carência) — com a data de liberação
- Rede bloqueada (aguardando missão do mês)
- Disponível para saque agora
- Em saque solicitado / aprovado
- Já pago
- Total ganho (comissões + produto criado + indicação), com o detalhamento das partes

Depois, ligar **todas** as telas nessa mesma função, sem cálculo local:

- Painel do coach (Vendas Diretas / Rede) e botão de saque
- Modal da pessoa no admin (cabeçalho com os 4 cartões)
- Contas a Pagar e Resumo Financeiro do admin
- Painéis de parceiro e profissional

E rodar uma reconciliação única que regrava as linhas de carteira (disponível, pendente, ganho, sacado) a partir desses lançamentos, para todo mundo — corrigindo o sacado divergente.

## 4. Como conferir

Abrir a Ana Flávia depois da correção e ver os mesmos números no painel dela, no modal do admin e no Contas a Pagar: disponível para saque R$ 232,44, rede bloqueada R$ 142,69, a liberar R$ 200,48, já pago R$ 278,47. Repetir em mais duas pessoas com perfis diferentes (parceiro e profissional).

## Detalhes técnicos

- Nova função `wallet_statement(profile_id)` (SECURITY DEFINER, `search_path=public`) somando `commissions` por `status`/`available_at`/`is_network`/`force_released`, receita de criador em `partner_product_orders` (líquido menos co-produção/custos), `student_wallets` de indicação e `withdrawal_requests`/`student_withdrawal_requests` por status.
- `recalc_wallet_for_owner` passa a gravar a partir da mesma função (fim do `pendente = ganho − sacado`) e `total_withdrawn` passa a vir de saques `paid`.
- Front-end: `WalletTab.tsx`, `admin-payouts.functions.ts`, `admin-financial.functions.ts`, `partner-orders.functions.ts`, `network-unlock.functions.ts` e `PayablesPanel.tsx` passam a consumir a função única; remover as somas paralelas.
- Reconciliação executada pelo botão "Conferir todas as carteiras" já existente, com log em `wallet_audit_runs`/`wallet_audit_diffs`.
- PEDAL NIGHT: update de dados em `partner_products` zerando `is_recurring` e campos de recorrência.
