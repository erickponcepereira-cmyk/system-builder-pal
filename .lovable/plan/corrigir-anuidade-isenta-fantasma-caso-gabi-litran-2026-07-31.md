# Corrigir anuidade "isenta" fantasma (caso Gabi Litran)

## O que realmente aconteceu

Verifiquei o cadastro da Gabi Litran no banco:

- Parceira `Litran moda esportiva`, status `pending`, `activation_paid_at` vazio (nunca pagou).
- Também tem ficha de coach na etapa `awaiting_payment`.
- Ela tem 3 tentativas de pagamento da anuidade: duas `rejected` e uma `cancelled` (PIX de R$ 179,90), e o pedido continua `pending`.

Ou seja: no banco ela **não** pagou. O que a fez "passar de fase" no app é uma regra de fallback no cálculo da anuidade: quando existe ficha de coach e o perfil está `active`, o sistema considera a anuidade como **"Ativa (isenta)"** por 1 ano contando da criação da ficha — mesmo sem nenhum pagamento. Isso vale tanto na tela do usuário quanto na listagem de anuidades do admin.

Hoje 26 contas caem nessa regra; 14 delas ainda estão em `awaiting_payment` (ou seja, aparecem como isentas sem nunca ter pago).

## Correção proposta

1. **Restringir a isenção automática**: só considerar "isenta" contas antigas — ficha de coach criada antes do início do fluxo de anuidade (15/06/2026) e já liberada/aprovada. Quem foi criado depois disso, ou ainda não foi liberado, passa a aparecer como **"Não iniciada"** e volta a ver o botão de pagar anuidade. Mesma regra aplicada na listagem do admin, para os dois ficarem consistentes.
2. **Gabi**: com a regra corrigida ela volta automaticamente para a aba de pagar anuidade. Além disso, limpo o vínculo do pagamento cancelado no pedido pendente dela, para que um novo PIX/cartão possa ser gerado sem erro de "pagamento já existente".
3. **Varredura**: listar (e corrigir) as demais contas que hoje estão marcadas como isentas indevidamente, aplicando o mesmo critério — nenhuma conta legítima já paga é afetada, porque essas têm `activation_paid_at` preenchido.

## Detalhes técnicos

- `src/lib/annual-activation.functions.ts`: no `getMyAnnualActivation`, trocar o fallback `coach?.id && profile.status === 'active'` por um critério com cutoff (`coaches.created_at < 2026-06-15`) **e** coach liberado (`onboarding_stage = 'released'` ou `approved_at` preenchido). Aplicar o mesmo em `listAllAnnualActivationsAdmin`.
- Dados: `UPDATE store_orders SET mp_payment_id = NULL` no pedido pendente de ativação da Gabi (`894d74ce…`), já que o pagamento vinculado está `cancelled`.
- Nenhuma mudança de schema é necessária; nenhuma alteração em `partners`/`coaches` da Gabi, pois os campos de pagamento já estão corretamente vazios.
