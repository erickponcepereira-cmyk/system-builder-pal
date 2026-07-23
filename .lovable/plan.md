## Problema

O `CoproductionEditor` hoje calcula:

- `Líquido estimado = bruto × 0,90` (netFactor fixo de 10%)
- `Comprometido = soma dos %/fixos aplicados sobre esse líquido estimado`
- `Sobra p/ você = líquido estimado − comprometido`

Duas coisas estão erradas:

1. **Base do rateio não bate com o trigger real.** O trigger `apply_coproduction_credits_on_order` usa `net = gross − payment_fee − tax_amount` (percentual varia por método de pagamento: PIX 0,99% / cartão 4,98%, imposto 6%, ou zero se `skipTax`). O `0,10` fixo não representa isso e ainda difere no cartão vs PIX.
2. **"Sobra p/ você" ignora taxa do sistema e comissão do coach.** O que sobra para o criador é o `partnerNet` de `computeFromCharge` (bruto − gateway − imposto − sistema − comissão do coach) menos os créditos de co-produção. Do jeito atual, o card promete uma sobra que nunca vai cair na carteira do criador.

No exemplo (bruto R$ 146,71, cartão, sem custom split):

- Base real do rateio (o que o trigger vê) = 146,71 − 7,31 − 8,36 = **R$ 131,04** (não 132,04)
- Comprometido Luana (30% dessa base) = **R$ 39,31** (não 43,35)
- `partnerNet` real (após sistema 5% e comissão coach 10% padrão) ≈ **R$ 105,54**
- Sobra real do criador = 105,54 − 39,31 = **R$ 66,23** (o card mostra 88,69)

## continua errado essa forma que está sendo colocado, o liquido distribuivel ja é o valor de 146,71, as taxas de cartão, imposto, pix, sistema e comissão já foram retirados desse valor, esse já é o liquido a ser distribuido, porque está duplicando as taxas?  
  
o que deve realmente ser feito é: os 146,71 ja foram descontadas todas as taxas, esse é o valor liquido que será distribuido, então dos 146,71 vai ser feito a divisao proposta pela pessoa, no caso da luana 43,35 e o restante 103,36 vai para a delma. isso no caso de pagamento no cartão, se a pessoa pagar no pix esse valor muda proporcionalmente por conta das taxas. então o valor que seria de diferença (3,99% será distribuido igualmente para ambas, mas isso é referente ao valor de diferença de pagamento no cartão para com pix e deve ser expresso no sistema).

&nbsp;