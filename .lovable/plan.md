# O R$ 452,31 do Jorge: comissão de vendedor na compra dele mesmo

## O que está acontecendo (verificado no banco)

A linha grande que aparece agora no Jorge **não é mais** "produto criado" — é uma **comissão de vendedor** de R$ 452,31 (status pendente, criada em 21/08) sobre a venda:

- Produto: **adesão sistema estacionamento** (R$ 540,00) — não é produto do Jorge.
- Comprador: **o próprio Jorge**.
- Quem fez a venda: **Nathan Utuari** (venda registrada pelo painel dele).
- Nessa mesma venda o Nathan recebeu só R$ 50,26 como "Master Coach (cross-sale)".

Causa confirmada na função do banco `process_paid_transaction`: para decidir quem é o "coach da venda", ela primeiro procura se **o próprio comprador tem cadastro de coach aprovado** e, se tiver, usa esse cadastro. Como o Jorge é coach, ele virou o "vendedor" da própria compra e ficou com a fatia de vendedor (R$ 452,31), enquanto o vendedor real (Nathan) só recebeu o bônus de master coach.

## Alcance (levantamento no banco)

Comissões em que o beneficiário é o próprio comprador da transação: **2 casos**, R$ 515,88 no total.

| Pessoa | Produto | Valor | Situação |
|---|---|---|---|
| Jorge Ramos de Oliveira | adesão sistema estacionamento | R$ 452,31 | pendente (ainda não pago) |
| Vitória Berchieli Molina | Adesão Anual | R$ 63,57 | já liberado (jul/2026) |

Nenhum dos dois foi sacado como "produto criado"; o do Jorge ainda está pendente, então dá para corrigir antes de virar dinheiro.

## Correção

1. **Regra de quem é o vendedor** (`process_paid_transaction`): quando existir vendedor registrado na venda (venda feita pelo painel de um coach), ele é o vendedor. Quando não existir, vale o coach responsável pelo aluno. Em nenhuma hipótese o próprio comprador recebe a fatia de vendedor da compra dele mesmo — nesse caso a fatia vai para o coach responsável do comprador (ou, se não houver, para a carteira do sistema, como já acontece hoje quando não há coach).
2. **Reprocessar a venda do Jorge** com a regra nova, para a comissão de vendedor ir para o Nathan e o valor sumir da carteira do Jorge.
3. **Decidir o caso da Vitória (R$ 63,57, já liberado em julho)**: por padrão vou **deixar como está** e apenas registrar, para não mexer em saldo antigo já disponível — me avise se quiser estornar também.
4. Rodar a auditoria de carteiras e conferir que nada pago ficou acima do liberado real.

## Como conferir

Abrir o Jorge em Pagamentos: a aba Comissões deve mostrar só as comissões reais dele (vendas para os alunos dele: Adesão Anual, Ticket Desafio) e **não** a linha de R$ 452,31 do "adesão sistema estacionamento". No Nathan, essa venda deve aparecer com a comissão de vendedor.

## Detalhes técnicos

- Migration em `public.process_paid_transaction`: a resolução de `coach_row` hoje é "coach aprovado com o mesmo `profile_id` do comprador → senão `students.coach_id`". Passa a ser: `metadata->>'created_by_coach_id'` (quando existir e for coach válido) → `students.coach_id` → coach do próprio comprador **somente se não for a compra dele mesmo**.
- Depois da migration, chamar `process_paid_transaction` para a transação `a767a6f7-745b-4be2-a113-1f4024bfb53f` (a função já apaga e recria as comissões da transação).
- Conferir se `process_partner_product_order_paid` tem o mesmo padrão de auto-atribuição antes de fechar.
- A correção anterior de "produto criado" em `src/lib/admin-payouts.functions.ts` continua válida; nenhuma tela precisa mudar nesta etapa.
