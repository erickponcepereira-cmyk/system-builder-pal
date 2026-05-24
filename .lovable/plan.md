## Problema

Dois componentes ainda mostram valores hardcoded mesmo após o reset do banco:

1. **`src/components/coach/tabs/WalletTab.tsx`** — saldo R$ 2.450, pendente R$ 654, total ganho R$ 12.840, total sacado R$ 9.736, e histórico fake (Carlos, Ana, Pedro, Saque PIX).
2. **`src/components/coach/tabs/OverviewTab.tsx`** — stats fake (24 alunos, R$ 3.680 vendas, R$ 1.104 comissões, R$ 2.450 saldo).

## Plano

### 1. `WalletTab.tsx`
- Buscar do banco no `useEffect`:
  - `wallets` (por `profile_id`) → `available_balance`, `pending_balance`, `total_earned`
  - `withdrawal_requests` (status approved) → soma = total sacado
  - `commissions` (por `beneficiary_profile_id`) ordenadas desc → histórico recente
  - `withdrawal_requests` recentes → mesclar no histórico
- Substituir os 4 valores hardcoded e o array fake do "Histórico recente" pelos dados reais.
- Formatar tudo em BRL; vazios mostram `R$ 0,00` e mensagem "Sem movimentações ainda".

### 2. `OverviewTab.tsx`
- Receber `coachId` (já recebe) e buscar:
  - Alunos ativos: `students` count onde `coach_id = coachId` (ativos)
  - Vendas/mês: `transactions` (ou `subscriptions`) do mês atual associadas ao coach
  - Comissões/mês: `commissions` do mês atual com `beneficiary_profile_id` = profile do coach
  - Saldo: `wallets.available_balance`
- Substituir o array `stats` hardcoded; remover os "+3 / +18% / +22%" fictícios (mostrar variação real só se for trivial calcular; caso contrário, omitir).

### 3. Verificação
- Após edit, abrir as duas telas no preview e confirmar que todos os campos exibem `R$ 0,00` / `0` no estado atual (banco zerado).

### Detalhes técnicos
- Usar `supabase` client direto (mesmo padrão de `MyNetworkPanel.tsx`).
- Nenhuma migration necessária — só leitura.
- Manter o restante de WalletTab (modal de saque, vendas cruzadas) intacto.
