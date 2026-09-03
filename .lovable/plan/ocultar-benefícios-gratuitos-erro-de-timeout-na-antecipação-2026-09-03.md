# Ocultar benefícios gratuitos + erro de timeout na antecipação

## 1. Ocultar/exibir benefícios gratuitos (mesma regra da loja)

Hoje o controle de visibilidade por coach existe só na loja (`useStoreVisibility` + RPC `coach_store_set_hidden` / `store_visibility_context`). As telas de gratuitos não usam nada disso: listam tudo que estiver aprovado e ativo.

O que muda:

- **Painel do coach — aba Benefícios**: cada cartão de benefício ganha o mesmo botão de olho da loja ("Ocultar da sua rede" / "Mostrar para sua rede"), usando exatamente a mesma RPC e os mesmos tipos já existentes (`product` + `partner_product` / `professional_product`). Nada de tabela nova.
- **Atalhos de bloco**, no mesmo padrão da loja: ocultar todos os gratuitos de parceiros e todos os gratuitos de profissionais da rede (`vendor_partner` / `vendor_professional`).
- **Tela do aluno (Gratuitos)**: os benefícios ocultados por qualquer coach da linha acima dele deixam de aparecer, respeitando a exceção já implementada — se quem criou o produto for o próprio coach do aluno ou alguém mais próximo na linha, o benefício continua visível.
- Regra herdada da loja mantida: o coach vê o que ele mesmo ocultou (marcado com o olho fechado), quem está abaixo dele não vê.

## 2. Erro "canceling statement due to statement timeout" ao antecipar

O botão "Liberar" chama `admin_advance_commission_release`, que ao final roda o recálculo completo das carteiras da pessoa (`recalc_wallets_for_owner`) dentro da mesma transação. Com 60+ comissões selecionadas de uma vez, a chamada estoura o tempo limite do banco e o erro aparece — mesmo quando parte das linhas já foi marcada.

Correção:

- Separar a liberação do recálculo: a marcação das comissões é feita primeiro, o recálculo da carteira vem em uma segunda chamada curta. Assim nenhuma das duas etapas se aproxima do limite de tempo.
- Processar a seleção em lotes (blocos de comissões) em vez de um único comando gigante, somando o total efetivamente liberado e mostrando esse valor no aviso final.
- Se algum lote falhar, informar quanto já foi liberado e o que ficou pendente, em vez de um erro genérico.
- Depois de aplicar, refazer a liberação pendente da Ana Flávia e conferir que o disponível sobe exatamente o valor mostrado no botão.

## Detalhes técnicos

- `src/lib/coach-store-overrides.ts` (hook `useStoreVisibility`) é reutilizado como está.
- Edições: `src/components/coach/tabs/BenefitsTab.tsx` (toggles + filtro `isHiddenByMe`) e `src/routes/_authenticated/student.freebies.tsx` (filtro `isHiddenForViewer` nas duas listas: `partner_products` e `professional_products` de kind `free`).
- Migration: nova função `admin_advance_commission_release_batch` (marca e audita, sem recalcular) + RPC de recálculo isolada; `src/lib/admin-payouts.functions.ts` passa a chamar em lotes e retorna o total aplicado; `admin.payments.tsx` exibe esse total.
- Verificação: `node node_modules/typescript/bin/tsc --noEmit` com zero erros.

## Fora do escopo

Nenhuma mudança nas regras de comissão, carência ou meta de rede; nenhuma alteração no visual atual das telas além dos botões de olho.
