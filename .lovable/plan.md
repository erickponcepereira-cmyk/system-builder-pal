# Venda Master Coach (pedido PP-D38D35CB): 29,45 e 3,59 estão no beneficiário errado

## O que a conta deveria dar (regra combinada)

Venda de R$ 1.300,00 no PIX, aluna Gabi Litran, coach titular Marilene (Mari), venda feita pela Vanessa/Vimark (Master Coach).

```text
Bruto                        1.300,00
- taxa PIX                      12,87
- imposto                        0,00
- taxa de sistema (7%)          90,10
= líquido                    1.197,03
Comissão de coach (10%)        119,70
- rede L1 (10%)                 11,97
- rede L2 (5%)                   5,99
- rede L3 (3%)                   3,59
= comissão após rede            98,15
Master Coach (70% de 98,15)     68,70  -> Vanessa (Vimark)
Titular (30%)                   29,45  -> DEVE ir para a Mari
```

Ou seja: percentual do master (70%, lido da configuração da Mari) e o valor de 68,70 estão **corretos**.

## O que realmente aconteceu (verificado no pedido)

- 68,70 "Master Coach (cross-sale)" -> Vimark. Correto.
- **29,45 "Comissão do Vendedor" -> Vimark.** Errado: é a parte do titular, deveria ser da Mari.
- **3,59 "Comissão Direta (sem upline N3)" -> Vimark.** Errado: nasceu porque foi usada a linha da Vanessa (que não tem N3); na linha da Mari esse valor seria dela.
- **Rede errada:** L1 11,97 foi para valdenici e L2 5,99 para Nathan (linha da Vanessa). Pela linha da Mari seria L1 Ana Flávia Lucas e L2 Nathan.
- O pedido gravou `titular_coach_id` = Vanessa, quando o titular é a Mari.

Resultado: Vanessa ficou com 101,74 e a Mari com 0,00.

## Causa

A função `create_partner_company_order` (produtos de empresa parceira) escolhe o vendedor como
"quem clicou, senão o coach do aluno". A correção de venda cruzada de Master Coach só existe na
função irmã de produtos de profissional (`create_partner_product_order`), que já mantém o titular
como dono da comissão.

## Correção proposta

1. Em `create_partner_company_order`, aplicar a mesma regra da função de profissional: quando o
   comprador é aluno de outro coach e quem vende é Master Coach, o vendedor da comissão passa a ser
   o **coach titular do aluno**; a Master Coach entra só com o bônus e como `seller_coach_id` no
   histórico. As uplines L1/L2/L3 passam a ser as do titular.
2. Gravar `metadata.master_cross_sale.titular_coach_id` com o titular real (hoje grava o master).
3. Sem N2/N3 do titular, o valor segue a regra atual do titular (nunca cai na carteira do master).
4. **Acerto retroativo do PP-D38D35CB**: mover 29,45 e 3,59 da Vanessa para a Mari e trocar a rede
   (11,97 de valdenici para Ana Flávia; 5,99 permanece com Nathan); manter os 68,70 da Vanessa.
   Depois rodar a reconciliação de carteiras.
5. Varrer os demais pedidos de empresa parceira com bônus de master já lançado e aplicar o mesmo
   acerto onde o titular tiver ficado sem a parte dele.

## Validação

- Conferir no extrato: Vanessa 68,70; Mari 29,45 + 3,59; Ana Flávia 11,97; Nathan 5,99.
- Fazer uma venda de teste da Vanessa para outra aluna da Mari e conferir os mesmos beneficiários.
- Conferir que o líquido do parceiro (1.077,33) e as taxas não mudam.
