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

## A carteirinha de parceiro valia sem pagamento (09/10/2026)

**Caso da Claudia Vilma Bugs:** carteirinha ativa, resgatando benefício
gratuito, sem nunca ter comprado nada e com a mensalidade **bloqueada** em
setembro e outubro. O `card_valid_until` dela é **nulo** — quem segurava a
carteirinha de pé era o benefício de parceiro:

```
student_has_partner_benefits(aluno) = existe unidade aprovada,
  com produto aprovado e ativo, ligada a students.partner_id
```

e essa pergunta **não olhava pagamento nenhum**. A tela dizia isso com todas as
letras: *"get the carteirinha always active, regardless of
subscription/card_valid_until"* (`student.card.tsx`). O benefício foi desenhado
para **colaborador** de parceiro, mas `students.partner_id` também aponta para
a própria unidade de quem é dono dela — então todo parceiro virou portador de
carteirinha vitalícia, pagando ou não. Dos 26 que viviam só do benefício,
**25 eram donos da unidade**, não colaboradores.

**O resgate não era verificado no servidor.** `requireCard()` existe só na
tela; `student_generate_partner_coupon`, `student_generate_professional_coupon`
e `redeem_freebie` nunca perguntaram pela carteirinha. Quem chamasse a RPC
direto resgatava sem carteirinha nenhuma — a trava era só visual.

**Como ficou:** a regra mora em `student_card_ativa(aluno)` = dia comprado em
`card_valid_until`, **ou** benefício de unidade parceira com a mensalidade em
dia. As três funções de resgate consultam ela. `student_has_partner_benefits`
passou a exigir `NOT is_user_blocked_by_subscription(user_id)` — a mesma régua
de inadimplência do resto do sistema, que olha fatura `blocked` — e a ignorar
produto apagado (`deleted_at`), que antes ainda valia.

Efeito medido: **16 perderam a carteirinha** (os bloqueados) e **10
continuaram** com ela (os que pagam). Voltam sozinhos quando pagarem.

**O cupom também passou a exigir carteirinha ativa (09/10/2026).** Decisão do
Erick no mesmo dia: cancelar os cupons de quem está bloqueado e travar o uso.
Foram **23 cupons cancelados** (21 de parceiro, 2 de profissional) de 12
pessoas, e a trava virou o gatilho `guard_resgate_exige_carteirinha` nas duas
tabelas — não dentro de `partner_redeem_coupon` — porque **o cupom de
profissional não tem função de balcão**: é marcado como usado por UPDATE
direto, pela policy "Professional updates own coupons". No gatilho a regra vale
em qualquer caminho. Admin passa, para correção manual.

Sobraram 128 cupons `active`, 73 deles de quem hoje não tem carteirinha ativa —
esses não podem ser usados, e voltam a valer sozinhos se a carteirinha voltar.

**A pergunta que ficou:** 6 dos 23 cancelados eram da Arlete e da Gabi Litran,
que estão atrasadas na mensalidade mas **têm carteirinha paga por compra**
(até 11/10 e 27/11). Como a geração de cupom só consulta `student_card_ativa`,
elas regeram o cupom num toque. Para o bloqueio valer de verdade nesse caso, a
mensalidade atrasada teria que derrubar também o dia comprado — uma linha em
`student_card_ativa`. Não foi feito: dia comprado foi pago.

**O que continua sendo decisão de negócio:**
- **Se o benefício deve valer para o dono da unidade ou só para colaborador.**
  Hoje vale para os dois, desde que em dia. Restringir a colaborador tiraria a
  carteirinha de 10 parceiros que pagam. **Confirmado pelo Erick em 09/10:
  vale para os dois, desde que em dia.**
