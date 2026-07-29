## O que eu confirmei no banco antes de planejar

- Hoje **não existe** nenhuma linha com `level > 0` e rótulo "sem upline" — mas existem **~200 comissões de retorno sem nenhuma marca no rótulo**: linhas com `slot_label = 'Linha 1/2/3'` (e `Upline N`) em que o **beneficiário é o próprio coach vendedor** da venda. Total afetado: R$ 200+ (ex.: Linha 3 → 33 linhas, R$ 61,57; Linha 2 → 29 linhas, R$ 88,05; Linha 1 → 9 linhas, R$ 49,07), parte já `available`, parte `pending`.
- Isso confirma o diagnóstico e mostra que a "correção mínima" (mover a checagem do texto para antes do nível) **não resolve**: esses casos não têm "sem upline" no rótulo. Só a comparação estrutural resolve.
- A mesma regra frágil está duplicada no SQL, dentro de `recalc_wallets_for_owner`:
  `level > 0 OR (label ~ 'linha|upline N' AND label !~ 'sem upline')`. É ela que joga o retorno no bloqueio de rede.
- `listBlockedCommissions` já inclui os dois tipos de bloqueio (prazo e rede), mas usa `isNetworkCommissionRow` — ou seja, hoje ele classifica errado junto com o resto; corrigindo o classificador, ele passa a acertar.
- Textos: `PendingInfo days={3}` em `WalletTab.tsx:265` e `MyNetworkPanel.tsx:191`; o banco usa 7 dias.

## Abordagem

Em vez de manter duas regras de texto (SQL + TS) que sempre divergem, gravo a classificação **uma vez, no banco**, e todo mundo lê o mesmo campo.

### 1. Coluna canônica `is_network` em `commissions`

- Migration adiciona `is_network boolean not null default false`.
- Função `public.commission_is_network(...)`: é rede quando a comissão é fatia de linha/upline **e** o beneficiário **não é o coach vendedor** daquela venda. O vendedor é resolvido pela origem (`partner_product_orders.selling_coach_id` / coach vendedor do pedido de loja) e, como reserva, pela linha "Comissão do Vendedor" da mesma venda.
- Trigger `BEFORE INSERT/UPDATE` preenche a coluna, para nenhum caminho novo (loja, parceiro, profissional, recorrência) depender de rótulo.

### 2. Padronizar a gravação do retorno

Nas funções que geram comissão sem upline, gravar sempre `level = 0` e `slot_label = 'Comissão Direta (sem upline N<n>)'` — a convenção já correta. O valor das fatias **não muda**, só o rótulo/nível/destino.

### 3. Consumo único da classificação

- `recalc_wallets_for_owner`: trocar a expressão de texto por `c.is_network`.
- `src/lib/financial-dedupe.ts`: `isNetworkCommissionRow` passa a ler o campo da linha (com o texto só como fallback para dados antigos), e os chamadores (`admin-financial.functions.ts`, `admin-payouts.functions.ts`, `network-unlock.functions.ts`) passam a selecionar `is_network`.

### 4. Backfill com revisão antes do UPDATE

- Primeiro rodo o SELECT (mesma condição estrutural) e te mostro **a lista de pessoas, quantidade e valores**.
- Só depois da sua conferência aplico a migration que normaliza `level`/`slot_label`/`is_network` e roda `admin_reconcile_all_wallets`.

### 5. Prazo 7 dias

Constante única `COMMISSION_HOLD_DAYS = 7` (em `src/lib/financial-dedupe.ts`), importada em `WalletTab.tsx` e `MyNetworkPanel.tsx`.

### 6. Verificação da antecipação pelo admin

Depois da correção, testo `listBlockedCommissions` com um coach que tenha saldo de rede bloqueado e confirmo que aparecem os dois tipos (prazo e meta de rede) e que `advanceCommissionRelease` libera.

## Aceite verificado ao final

Coach sem upline vê a fatia de retorno em **direta e desbloqueada**; rede mostra só downline; Ana Flávia, Nathan e Vimark consistentes; textos com 7 dias; admin antecipa nos dois bloqueios.

## Não faço

Não mexo na regra dos 7 dias no banco, não altero cálculo de valores, e nenhum `UPDATE` em `commissions` sem você revisar o SELECT antes.
