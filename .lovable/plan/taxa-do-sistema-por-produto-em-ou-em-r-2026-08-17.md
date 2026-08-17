# Taxa do sistema por produto: em % ou em R$

Hoje a taxa do sistema personalizada por produto só aceita percentual (`system_fee_pct_override`). A ideia é permitir também um valor fixo em reais, escolhido na tela de aprovação do produto.

## Como vai funcionar

Na modal de aprovação do produto (parceiro e profissional), o campo "Taxa do sistema deste produto" ganha um seletor com duas opções:

- **Percentual (%)** — comportamento atual (em branco = 5% padrão).
- **Valor fixo (R$)** — o sistema retém exatamente esse valor por venda, em vez de aplicar percentual.

O resumo de comissões recalcula ao vivo (cartão e PIX) e, ao salvar, o líquido do dono do produto e as divisões de rede são regravados com a nova regra. O parceiro/profissional passa a ver na sua tela "− Taxa do sistema (R$ X,XX)" quando for valor fixo.

Regras:
- Só um dos dois modos vale por produto (escolher R$ limpa o %, e vice-versa).
- Valor fixo é limitado ao que sobra depois de taxa de pagamento e imposto (nunca deixa o líquido negativo).
- Produtos existentes continuam iguais, sem nenhuma mudança.

## Detalhes técnicos

1. **Banco (migração)**
   - Nova coluna `system_fee_amount_override numeric` (nulo por padrão) em `partner_products` e `professional_products`.
   - Atualizar `create_partner_product_order`, `create_partner_company_order` e `create_scheduled_professional_order`: se `system_fee_amount_override` não for nulo, `system_fee = least(override, base_apos_imposto)`; senão mantém o cálculo percentual atual (com `system_fee_pct_override` ou 5%).

2. **`src/lib/partnerFinance.ts`**
   - `PartnerSplitOverride` ganha `systemFeeAmountOverride?: number | null`.
   - `computeFromCharge`: quando presente, `systemFee = min(override, remaining)` e `systemFeePct` derivado só para exibição.
   - `computeFromReceive`: resolver o preço bruto considerando a parcela fixa (fórmula com termo aditivo em vez de fator).

3. **`src/components/admin/ProductReviewModal.tsx`**
   - Seletor "%" / "R$" + input único; salvar grava a coluna correta e zera a outra; recálculo dos campos `partner_net_amount` / `professional_net_amount`, `coach_commission_amount` e `network_l1/l2/l3_amount` como já ocorre hoje.

4. **Telas do dono do produto**
   - `src/routes/_authenticated/partner.tsx` e `src/components/professional/ProfessionalProductsPanel.tsx`: ler a nova coluna, repassar no split e exibir a linha da taxa em R$ quando for valor fixo.
