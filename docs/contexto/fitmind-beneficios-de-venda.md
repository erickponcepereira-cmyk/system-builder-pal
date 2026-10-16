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

## Leitura de QR no balcão do parceiro (16/10/2026)

**O painel profissional não tem aba de leitura** — quem atende no balcão usa o
painel de parceiro (`partner.tsx`), que tem duas: **"Scanner"**
(`PartnerFreebieScanner`, a agenda do dia) e **"QR"** (`QrCodePanel`). As duas
estavam quebradas, e a medida era clara: 0 visitas por leitura e 0 reservas
usadas em 30 dias (a última leitura de carteirinha foi em 28/08).

**O aluno mostra três QRs diferentes**, e os formatos não se confundem:

| QR | Conteúdo | Onde nasce |
|---|---|---|
| Carteirinha | `<origem>/checkin/<uuid do aluno>` | `student.card.tsx`, `student.freebies.tsx` |
| Cupom | `COUPON:` + 24 hex **maiúsculo** | `components/student/CouponModal.tsx` |
| Reserva | 32 hex **minúsculo**, cru | `components/student/StudentFreebieReservations.tsx` |

Antes cada aba entendia um pedaço — a "Scanner" só reserva, a "QR" só
carteirinha e cupom — e o parceiro não tinha como saber qual usar. Agora as duas
montam o mesmo `components/partner/LeitorQrDoAluno.tsx`, que classifica o QR com
`lib/qr-do-aluno.ts` e chama a função certa. **Não volte a ter leitor por aba.**

Os três defeitos, para não repetir:

1. **`RETURNS TABLE(... status text ...)` com coluna enum quebra em tempo de
   execução, não na criação.** `partner_freebie_do_dia` devolvia
   `r.status` (enum `reserved|used|cancelled|expired`) e dava `42804 structure of
   query does not match function result type` toda vez que a aba abria. O
   `CREATE FUNCTION` passa; só o primeiro `SELECT` acusa. Cast explícito sempre.
2. **Regra de acesso copiada é regra que diverge.** `redeem_partner_freebie` já
   aceitava colaborador via `partner_pode(unidade, 'scanner.usar')` desde
   19/08 — as quatro funções da aba "QR" continuaram procurando
   `partners.profile_id = usuário`, e o colaborador do balcão levava "Apenas
   empresas parceiras podem validar QR". A escolha e a autorização da unidade
   agora moram em `partner_unidade_do_balcao`. Sem `_partner_id` (app antigo em
   cache) ela só decide quando a pessoa tem **uma** unidade aprovada; com mais de
   uma, pede para escolher — o `LIMIT 1` sem `ORDER` de antes gravava a visita
   numa unidade qualquer.
3. **`@yudiel/react-qr-scanner` 2.x baixa o decodificador de CDN** quando o
   navegador não tem `BarcodeDetector` nativo (iPhone/Safari): `barcode-detector`
   → `zxing-wasm` → `fastly.jsdelivr.net/.../zxing_reader.wasm`. Sem esse
   download a câmera abre e **nada é lido, sem erro na tela** (o `onError` só
   fazia `console.warn`). A aba "QR" passou para `QRScannerModal`
   (html5-qrcode, sem rede), a mesma câmera da outra aba. O pacote continua no
   `package.json`, sem uso.

`QRScannerModal` também tinha corrida entre o `start()` assíncrono e a limpeza
do efeito — desmontar antes do `start` resolver deixava a câmera presa. Agora a
limpeza espera o start. E os botões **Confirmar**/**Validar** do leitor têm
trava contra toque duplo: o mesmo defeito do "um clique salva três produtos".

Testado em produção com rollback, simulando o login: dono e colaborador 6 de 6
OK; quem não é da unidade, 6 de 6 barrado com a mensagem certa. Migration
`20261016120000_leitura_de_qr_no_balcao.sql`.
