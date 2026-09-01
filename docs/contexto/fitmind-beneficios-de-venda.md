---
name: fitmind-beneficios-de-venda
description: "O que uma venda concede além de dinheiro na FitMind: duas réguas de desafio/carteirinha/pontos, e por que R$ 150 não dá ticket"
metadata: 
  node_type: memory
  type: project
  originSessionId: e1a19465-7811-40be-85b3-a6a1e7085b8d
  modified: 2026-08-20T03:55:35.137Z
---

Mapeado em 19/08/2026, junto com [[fitmind-sistema-de-taxas]]. Consultas em
`C:\dev\fitmind-acesso\levantamento-taxas-4.sql`, série B.

**São duas réguas de benefício, uma por motor de venda** — mesmo desenho do
sistema de taxas.

**Parceiro/profissional é automático por faixa de preço**, em
`compute_partner_product_benefits(preço)`, chamada por
`grant_partner_product_perks(order_id)`:
`>= 1000` → 90 dias/3 tickets · `>= 500` → 60/2 · `> 150` → 30/1 ·
`>= 100` → 15/**0** · resto → 7/**0**.

**Uma venda de exatamente R$ 150,00 dá ZERO ticket de desafio** — a condição é
`> 150`, não `>= 150`. Foi o que aconteceu com o Erick em 19/08. O ticket só
começa em R$ 150,01. A régua recebe `GREATEST(gross_amount, price)`.
`grants_subscription_perks` força 30 dias/1 ticket; `perk_card_days_override` e
`perk_challenge_tickets_override` substituem o resultado.

**A loja é manual por produto**, sem régua: `has_challenge_access` +
`challenge_tokens_amount`, via gatilho `grant_challenge_token_on_paid` em
`transactions`. Duas condições não escritas em tela nenhuma: **comprador que
também é coach ou parceiro não recebe nada**, e o gatilho lê
`transactions.product_id`, que `mark_store_order_paid_and_process` preenche com
o **primeiro item do pedido** — num carrinho de dois produtos, o segundo não
concede benefício.

**Pontos medem coisas diferentes nos dois caminhos.** Loja:
`products.points_per_sale`, e se for zero o código força 1. Parceiro:
`compute_system_fee_points` = `floor(taxa_do_sistema / 2)`, zero se a taxa for
menor que R$ 2,00.

**Entrega digital não existe** (medido em 20/08): `digital_products` tem zero
linhas, `digital_purchases` zero, itens de pedido pago com `digital_product_id`
zero. E cinco produtos da loja são `kind = 'digital'` — Adesão Anual, Mentoria,
os três Tickets e o ebook Atração Feminina. Nenhum tem mecanismo de entrega.

**`find_nutritionist_for` é `SELECT NULL::uuid;`** — casca vazia. Toda fatia de
nutricionista vai para a carteira do sistema, sempre: R$ 94 por Protocolo/kit,
R$ 20 por Adesão Anual.

**Régua nova aprovada em 20/08** (`mudanca-01-regra-de-beneficio.sql`): a
fronteira dos R$ 150 **deixa de existir** porque 100–149,99 e 150–499,99 passam
a dar a mesma coisa. Fica `>=1000` 90/3 · `>=500` 60/2 · `>=100` 30/1 · resto
15/0. Toda venda abaixo de R$ 500 passa a dar mais. Pedido antigo **pode**
ganhar ticket se for reprocessado — decisão do Erick, sem guarda por data.

**Carteirinha deixa de ser cumulativa** (`mudanca-02-carteirinha-nao-cumulativa.sql`):
cada compra vale `data da compra + dias`, e a carteirinha é o **maior** desses,
nunca a soma. Premissas assumidas: compra nova nunca reduz, e não há teto
separado de 90 dias.

**Armadilha viva:** `recalculate_student_card_access` reconstrói
`card_valid_until` **só a partir de `transactions`** — os dias vindos de
parceiro/profissional são gravados direto na coluna por
`grant_partner_product_perks` e somem no recálculo. Chamar a função de hoje
sobre um aluno que só comprou de parceiro **zera a carteirinha dele**. A versão
nova lê as duas fontes.

Entrega física é uma fila de custo, não um fluxo com status: as fatias
`product_order_pool` viram `product_order_pool_entries` (o "Painel de Pedidos"),
e o prazo vem de `store_orders.delivery_days` / `delivery_started_at` /
`available_at`.
