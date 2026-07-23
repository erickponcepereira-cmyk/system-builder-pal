## Problemas a corrigir

**1. Visão do co-produtor mostra só o `%`** — não aparece quanto ele receberá em R$ no cartão nem no PIX, nem se há custo envolvido, nem quem paga o custo, nem qual é a base de rateio.

**2. O “líquido a distribuir” do editor ignora o custo** — o cabeçalho e as validações (`committedInBrl`, `remainingBrl`) usam sempre `netValue` puro, mesmo quando existe custo declarado. O bloco de custo hoje só influencia o *preview* daquele item que está sendo editado, mas não a base de rateio global do produto nem o que aparece na listagem.

## Correções (somente UI/apresentação — nenhuma alteração de banco ou de trigger)

Arquivo único: `src/components/shared/CoproductionEditor.tsx`

### A. Cálculo do editor passa a considerar custo

- Derivar `effectiveGlobalBase` a partir dos itens ativos: se pelo menos um item tem `has_cost=true`, subtrair a soma dos `cost_amount_brl` da base escolhida (`gross`, `net`, `net_after_cost`) — usar a mesma regra que o trigger `apply_coproduction_credits_on_order` já aplica no banco, para manter paridade.
- `committedInBrl` passa a somar: parcelas fixas + `(effectiveGlobalBase * %) / 100` para cada item de percentual, respeitando o `split_base` de cada linha.
- `remainingBrl` = `netValue − committedInBrl − custos que saem do criador`.
- Cabeçalho passa a mostrar: **Bruto**, **Líquido a distribuir**, **Custo total declarado** (quando houver), **Base efetiva de rateio**, **Comprometido**, **Sua sobra**.
- Validação de “excede disponível” também usa a base efetiva.

### B. Listagem dos coprodutores com valores reais (cartão e PIX)

Cada linha do `items.map` passa a mostrar, além do `%` ou valor fixo já exibido:

- `Cartão:` valor em R$ que o coprodutor receberá (split calculado sobre a base correta, + reembolso de custo se for `cost_bearer=collaborator`).
- `PIX:` mesmo valor com uplift de `PIX_UPLIFT_PCT` (~3,99%) aplicado proporcionalmente (mesma regra já documentada no bloco informativo).
- `Custo:` valor e quem assume (`você` / `coprodutor`), quando `has_cost=true`.
- `Base:` bruto / líquido / líquido pós-custo.

Isso vale tanto para o criador vendo o painel de edição quanto para o coprodutor abrindo em modo somente-leitura (é o mesmo componente).

### C. Preview do modal ganha PIX + cartão

Substituir o bloco “Preview por venda no cartão” por duas colunas: **Cartão** e **PIX (~+3,99%)**, cada uma mostrando: Base do rateio, Coprodutor recebe, Reembolso de custo (se aplicável), Você fica com.

### D. Bloco de custo só é usado se marcado

O bloco de custo já é condicional ao checkbox `hasCost`. Reforçar que, enquanto `hasCost=false`, `splitBase` é forçado para `net` e o custo não entra em nenhuma conta. Quando `hasCost=true`, o valor e o `costBearer` viram obrigatórios de fato (validação já existe) e passam a alterar a base efetiva global descrita em (A).

## Fora de escopo

- Nenhuma migração. O trigger `apply_coproduction_credits_on_order` já credita corretamente considerando custo — apenas espelhamos a mesma matemática na UI.
- Nenhuma alteração em `collab.functions.ts`, roteamento ou wallets.
