# Correção dos pontos: só a taxa de sistema real conta

## O que está acontecendo (verificado no banco)

Hoje o ponto da venda de loja é calculado assim: soma **tudo o que entrou na carteira do sistema naquela venda** e divide por 2. O problema é que, quando um destinatário do rateio não existe na venda, o valor dele é **redirecionado para a carteira do sistema** — e esse dinheiro, que não é taxa de sistema, entra na conta dos pontos.

Exemplos reais:

- **Ticket Desafio Premium (R$ 285)** — venda de 01/09 01:53. Entradas na carteira do sistema: `Sistema R$ 20,00` + `Nutricionista (nutricionista ausente) R$ 94,00` = R$ 114,00 → 57 pontos registrados.
- **Adesão Anual (R$ 179,90)** — fatias: `Sistema R$ 20,00` + `Nutricionista master R$ 20,00` + `Professor do curso R$ 49,90` = R$ 89,90 → ~44 pontos quando nutricionista/professor não existem e caem no sistema.

Ou seja: a fórmula (taxa ÷ 2) está certa, o que está errado é **o que está sendo chamado de taxa de sistema**. A fatia real "Sistema" desses dois produtos é R$ 20,00 → **10 pontos**, exatamente o esperado. O campo `points_per_sale` do produto (10) não é mais usado desde a unificação da regra.

## Correção

1. **Regra no banco (`process_paid_transaction`)**
   - Passar a somar apenas as fatias que são taxa de sistema de verdade: slots com `is_system_fee = true` ou destino `admin_wallet` **na configuração original do produto**, ignorando qualquer valor que só foi parar na carteira do sistema por redirecionamento (nutricionista ausente, professor ausente, sobra, etc.).
   - Marcar os lançamentos redirecionados na carteira do sistema com uma flag (`is_redirect`) para que fiquem visíveis no extrato mas fora do cálculo de pontos.
   - Manter `taxa ÷ 2`, arredondando para baixo, e manter o beneficiário como o coach titular do aluno.
   - Ajustar `revert_transaction_points` para a mesma base.

2. **Produtos de parceiro/profissional**: já usam a taxa de sistema correta (ex.: R$ 3,12 → 1 ponto; R$ 90,10 → 45 pontos). Sem mudança de fórmula — só a checagem de que nenhuma sobra redirecionada entra na soma.

3. **Retroativo (134 lançamentos de loja + 43 de parceiro desde 10/06)**
   - Recalcular cada lançamento de `coach_points_log` pela regra nova e corrigir os valores divergentes (o caso Premium cai de 57 → 10; a Adesão de 44 → 10).
   - Regravar `coaches.total_points`, `monthly_rankings`, `career_plan_progress` e `career_challenge_progress` a partir do log corrigido (hoje são somados incrementalmente e ficariam com resíduo).
   - Relatório final: coach, pontos antes, pontos depois, diferença.

4. **Front-end**: `calculatePointsFromSystemFee` (`src/lib/financialEngine.ts`) e `computeSystemFeePoints` (`src/lib/partner-product-benefits.ts`) continuam com taxa ÷ 2; a soma da taxa (`sumSystemFee`) passa a considerar também os slots com destino `admin_wallet`, para a simulação bater com a venda real.

## Validação

- Ticket Desafio Premium (R$ 285) → 10 pontos.
- Adesão Anual (R$ 179,90) → 10 pontos.
- Ticket Tradicional (R$ 100) → permanece 10 pontos.
- Venda de parceiro com taxa R$ 90,10 → permanece 45 pontos.
- `coaches.total_points` de cada coach = soma exata do seu `coach_points_log`.
