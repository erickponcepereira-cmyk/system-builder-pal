# Co-produção — reformulação completa

Hoje o fluxo pede um "código do coprodutor" digitado à mão, exige valor fixo em R$ (sem indicar se é do bruto/líquido), o convite não valida a rede, os créditos só existem para pedidos de `partner_product_orders` e não aparecem em relatórios do admin nem nas carteiras dos coprodutores nos vendedores de outros tipos de produto. Vamos reconstruir no padrão Kiwify/Hotmart: seletor visual, % OU valor fixo com aviso claro do que está sendo repassado, e crédito automático na carteira do coprodutor sempre que a venda for paga.

## O que muda para o usuário

1. **Editor novo (`CoproductionEditor`)**
   - Botão **"Adicionar coprodutor"** abre modal com **seletor** dos profissionais/parceiros da **minha rede** (dropdown com busca por nome/e-mail). Campo de "código" fica como opção secundária (colapsada em "Fora da minha rede? Usar código").
   - Toggle **% do líquido** ou **Valor fixo (R$)** — padrão é %.
   - Texto explicativo fixo no topo do card:
     > "Você define quanto do **valor líquido** (bruto – taxas – impostos) vai para cada coprodutor. Sua parte é o restante. O repasse é automático quando o pedido é pago."
   - Resumo em tempo real: "Você fica com R$ X (Y%) · Coprodutor 1 recebe R$ A (B%) · ..." usando preço atual do produto.
   - Validação: soma dos coprodutores ≤ 100% do líquido (ou ≤ líquido em R$). Bloqueia salvar acima disso com mensagem clara.

2. **Ciclo do convite** continua igual (`pending → accepted/rejected/cancelled`), com o produto pausado enquanto houver pendente — já existe.

3. **Distribuição automática ao pagar** (ver seção técnica):
   - Todo pedido pago envolvendo produto com coprodutores gera `commissions` (kind `coproduction`) para cada coprodutor **antes** dos slots normais consumirem o líquido. A parte do criador é reduzida pelo total dos coprodutores.
   - Crédito cai na `wallets`/`professional_wallets`/`partner_wallets` do coprodutor via o mesmo `recalc_wallets_for_owner` já em uso — sem tabelas paralelas.

4. **Visibilidade**
   - Relatório de vendas do coprodutor mostra linha "Co-produção – <produto> – <criador>" com valor.
   - Carteira do coprodutor: nova categoria "Co-produção" no histórico.
   - Admin → Financeiro/Pagamentos: filtro/coluna `coproduction` nas comissões; página da venda lista os splits (criador + cada coprodutor).
   - Painel do criador: relatório mostra bruto vendido e "Repassado em co-produção: R$ X".

## Técnico

### Banco (uma migração)

- `product_coproductions`:
  - `split_kind text not null default 'percent' check (in 'percent','fixed')`.
  - `percent_of_net numeric(5,2) null` (0–100). `fixed_amount_brl` fica opcional (mantém compat).
  - Backfill: linhas existentes viram `split_kind='fixed'`.
  - Trigger `validate_coprod_split_bounds` garante soma ≤ 100% (para percent) ou ≤ preço líquido (para fixed) por `product_id`.
- `commissions`: adicionar valores permitidos `'coproduction'` em `kind` (ou coluna equivalente atual) e `source_coproduction_id uuid null references product_coproductions(id) on delete set null`.
- Função `apply_coproduction_splits(p_transaction_id uuid)`:
  - Descobre produto do `transaction`/`partner_product_order`/`store_order`.
  - Lê coprodutores `accepted`.
  - Calcula valor de cada coprodutor a partir do **líquido** (bruto – taxa gateway – imposto), usando o mesmo `financialEngine` do server (helper `computeNet(gross, method, feeCfg, taxPct)`).
  - Insere `commissions` (idempotente por `(transaction_id, source_coproduction_id)`).
  - Deduz o total dos slots da carteira do criador antes dos slots padrão distribuírem.
- Chamar `apply_coproduction_splits` nos gatilhos existentes que marcam `transactions.status='paid'` (mesmo ponto onde comissões de rede são geradas) e no fluxo `mark_partner_order_paid`.
- `recalc_wallets_for_owner` já soma `commissions` → coprodutor vê saldo automaticamente. Adicionar case para rotular como "Co-produção" no `wallet-history`.
- Remover/depreciar `product_coproduction_credits` (deixar tabela, parar de gravar; migração futura opcional).

### Backend (`src/lib/collab.functions.ts` + novo `coprod-network.functions.ts`)
- `listMyCoproductionCandidates({ownerType,ownerId})`: retorna profissionais/parceiros da rede do usuário (uplines + downlines diretas conforme regra atual de rede) com `{id, type, name, code}`.
- `inviteCoproducer` aceita `{splitKind, percentOfNet?, fixedAmountBrl?}` além de `collaboratorRef` que pode ser `{by:'code', code}` **ou** `{by:'id', type, id}`.
- Validação server-side de soma ≤ 100 %/≤ líquido.
- `listProductCoproductions` retorna também `percent_of_net`, `split_kind`, `previewAmountBrl` (calculado com preço atual).

### Frontend
- `src/components/shared/CoproductionEditor.tsx` reescrito com o UX acima (modal, seletor da rede, toggle %/R$, preview em tempo real, mensagens de erro claras).
- Coach/Profissional/Parceiro — aba Carteira: histórico marca "Co-produção".
- Admin → Financeiro → Pagamentos: adicionar filtro `Tipo = Co-produção` e nova coluna "Origem" mostrando produto + criador.
- Relatório do criador em `coach-reports.functions.ts` (e parceiro/profissional equivalentes): expor total repassado em co-produção.

### Fora de escopo
- Convite para pessoas fora da rede continua via código (fluxo secundário mantido). Suporte a mais de 3 coprodutores mantido, sem limite hard.
- Não vamos tocar em `orderpool` nem em regras de MLM.

## Verificação
- Simular venda com 2 coprodutores (1 % e 1 fixo) — conferir carteiras, `commissions`, admin/pagamentos, relatórios do criador e coprodutor.
- Rejeitar/cancelar convite pausado e voltar a vender — nenhum split gerado.
- Migração idempotente + backfill dos convites atuais como `fixed`.
