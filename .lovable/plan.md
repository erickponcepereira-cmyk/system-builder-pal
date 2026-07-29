## Diagnóstico (confirmado no banco)

**1. Fabiana Katrine — R$ 106,40 bloqueados**
Ela tem 6 comissões `pending` com liberação em 04–05/08: 2× R$ 48,47 ("Comissão do Vendedor"), 2× R$ 2,96 ("Linha 2") e 2× R$ 1,77 ("Linha 3"). Hoje o admin não consegue dar baixa porque a carteira só considera disponível o que tem `available_at <= agora` — e as linhas de rede ainda exigem missão do mês desbloqueada. Não existe hoje nenhuma ferramenta de exceção/adiantamento.

**2. "Coaches a pagar" (R$ 2.456,90) ≠ Pagamentos**
Confirmado: R$ 1.496,29 (available) + R$ 960,61 (pending) = exatamente os R$ 2.456,90 do painel. Esse número é o **bruto histórico de comissões**, e por isso nunca vai bater com o que realmente há a pagar:
- não desconta os R$ 988,26 já sacados/pagos;
- não desconta saques reservados (solicitado/aprovado/processando);
- não desconta pagamentos feitos com saldo da carteira;
- classifica como "coach" comissões de rede gravadas com `level = 0` mas rótulo "Linha 1/2/3" e "Upline 1/2/3" (R$ 205,67 hoje) — a carteira as trata como rede;
- conta como "disponível" só o status, ignorando `available_at` e o desbloqueio mensal da rede.
Já o painel Pagamentos lê as carteiras: R$ 601,75 disponível / R$ 1.137,95 bloqueado / R$ 2.727,96 ganho.

**3. Vimark — venda fictícia**
A cada compra na loja o sistema grava **duas linhas**: o `store_order` e uma `transaction` com `purchase_type = 'store_order'`. O resumo do coach soma as duas tabelas → R$ 719,60 em vez dos R$ 359,80 reais (2 vendas de R$ 179,90: Julia e Tammylis). As comissões dessas vendas **estão corretas e creditadas** (R$ 63,57 vendedor + linhas), apenas ainda pendentes até 04/08 — nenhuma venda paga ficou sem comissão no sistema.

## O que será feito

### A. Exceção de adiantamento (resolve a Fabiana, sem gambiarra)
- Nova coluna `commissions.force_released` e tabela de auditoria `commission_release_advances` (quem liberou, quando, motivo, valor).
- Ajuste mínimo em `recalc_wallets_for_owner`: comissão com `force_released = true` conta como disponível, ignorando carência e trava de missão. Nenhuma outra regra muda.
- Função `admin_advance_commission_release(perfil, ids, admin, motivo)`: marca as comissões escolhidas, grava a auditoria e recalcula a carteira.
- Server functions `listBlockedCommissions` e `advanceCommissionRelease` em `admin-payouts.functions.ts`.
- UI em **Admin → Pagamentos**: botão "Antecipar liberação" na pessoa, modal listando as comissões bloqueadas com checkbox, valor total e campo de motivo. Depois disso o botão de baixa manual já existente funciona normalmente.

### B. Financeiro passa a bater com Pagamentos
Em `admin-financial.functions.ts` e no painel `admin.financeiro.tsx`:
- classificar rede pelo mesmo critério da carteira (`level > 0` **ou** rótulo "Linha N"/"Upline N"), corrigindo os R$ 205,67 hoje jogados em Coaches;
- "Disponível" passa a respeitar `available_at` e o desbloqueio mensal da rede — mesma regra da carteira;
- novo card no topo, **"A pagar agora (carteiras)"**, lido direto das carteiras, que é o número que o admin de fato paga e é idêntico ao painel Pagamentos;
- os cards por bucket ganham rótulo explícito de "ganho acumulado" e passam a mostrar também o já pago, para não serem lidos como "a pagar".

### C. Fim da venda fictícia
- Em `coach-profile-summary.functions.ts`, ignorar transações com `purchase_type = 'store_order'` ao somar vendas (o pedido da loja já é contado). Vimark volta a exibir R$ 359,80.
- Varredura nos demais pontos que somam as duas tabelas (`coach-sales`, `coach-reports`, `network-ranking`, `coach-career`) aplicando o mesmo filtro onde houver a mesma duplicação.

## Detalhes técnicos
- Migração: `ALTER TABLE public.commissions ADD COLUMN force_released boolean NOT NULL DEFAULT false`; `CREATE TABLE public.commission_release_advances` com GRANTs (`service_role` total, `authenticated` leitura via política de admin) e RLS restrita a admin; `CREATE OR REPLACE FUNCTION recalc_wallets_for_owner` reaproveitando o corpo atual com o único ajuste dos filtros `is_released`/rede; `CREATE FUNCTION admin_advance_commission_release` como `SECURITY DEFINER` validando `is_admin(_admin_user_id)`.
- Nada de UPDATE direto em saldos: tudo continua derivado das comissões pelo recálculo, o que preserva a rastreabilidade.
- Validação após aplicar: conferir que a carteira da Fabiana sobe R$ 106,40 em disponível e zera o bloqueado dessas 6 linhas; que a soma "A pagar agora" do Financeiro é igual à de Pagamentos; e que o resumo do Vimark mostra R$ 359,80.
