## Objetivo
Adicionar uma página dedicada **"Carteira do Admin"** acessível pelo menu lateral do painel admin, mostrando o saldo e extrato da carteira compartilhada das taxas do sistema (administrada pelos master admins Erick e Nathan).

## O que será criado

### 1. Nova rota
- `src/routes/admin.admin-wallet.tsx` → `/admin/admin-wallet`

A página exibirá:
- **Card de saldo** em destaque: saldo disponível (`admin_system_wallet.available_balance`), total recebido (`total_earned`) e total sacado (`total_withdrawn`).
- **Lista de master admins** que administram a carteira (Erick + Nathan), com nome, email e badge "Master".
- **Extrato completo** (tabela) com todas as movimentações de `admin_system_wallet_entries`: data, descrição (slot_label), aluno, produto, tipo (crédito/débito) e valor. Suporte a filtro por tipo (todos / créditos / débitos).
- **Botão "Registrar saque/baixa"** (abre modal): permite o master admin lançar um débito na carteira informando valor + descrição (ex: "Repasse mensal", "Pagamento de despesa"). Cria uma entry `kind=debit` em `admin_system_wallet_entries` e atualiza `available_balance` / `total_withdrawn`.

### 2. Entrada no menu lateral
- `src/components/admin/AdminShell.tsx`: adicionar item `{ to: "/admin/admin-wallet", label: "Carteira do Admin", icon: Wallet, perm: "admin_wallet" }` logo abaixo de "Financeiro".
- `src/lib/admin-permissions.ts`: adicionar a permission key `admin_wallet`.

Acesso restrito: apenas master admins (Erick e Nathan) — a página fará checagem de `is_master_admin` e exibirá "Acesso restrito" caso contrário.

### 3. Server functions (em `src/lib/admin-financial.functions.ts`)
Reaproveitar o que já existe e adicionar:
- `getAdminWallet()` → retorna `{ available, totalEarned, totalWithdrawn, masters: [{name,email}] }`. Usa o agregado já feito no `getFinancialOverview` mas isolado para essa página.
- `listAdminWalletEntries({ filter })` → retorna lista completa de `admin_system_wallet_entries` (já existe lógica em `listBucketCommissions` com `bucket=system`, será extraída/reutilizada).
- `registerAdminWalletDebit({ amount, description })` → valida que o usuário é master admin, insere entry `kind=debit` e atualiza `admin_system_wallet` (`available_balance -= amount`, `total_withdrawn += amount`). Operação envolvida em uma única chamada SQL para garantir atomicidade.

### 4. Migração
Criar function SQL `register_admin_wallet_debit(p_amount numeric, p_description text)` (SECURITY DEFINER) que:
1. Verifica se `auth.uid()` pertence a um master admin.
2. Insere a entry em `admin_system_wallet_entries` com `kind='debit'`.
3. Atualiza `admin_system_wallet` (decrementa available, incrementa withdrawn).
4. Retorna o id da entry criada.

## Resultado
- Erick e Nathan terão "Carteira do Admin" no menu lateral, abaixo de "Financeiro".
- Visão completa do saldo + extrato compartilhado, com possibilidade de dar baixa em saques/repasses diretamente pela interface.
- Outros admins não veem essa entrada nem conseguem acessar a rota.
