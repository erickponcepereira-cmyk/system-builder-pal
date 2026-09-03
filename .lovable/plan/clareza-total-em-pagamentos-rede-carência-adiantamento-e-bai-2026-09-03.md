# Clareza total em Pagamentos: rede, carência, adiantamento e baixas

## O que eu conferi no banco (Ana Flávia — agora)

Somando o extrato oficial (já sem duplicidades) contra os saques efetivamente pagos:

| Item | Valor |
|---|---|
| Comissões liberadas — venda direta | R$ 1.119,71 |
| Comissões liberadas — rede (agosto, meta batida + liberações manuais) | R$ 150,90 |
| Líquido de produto criado (parceiro/profissional) — tudo liberado | R$ 571,12 |
| Saques já pagos (8 saques, inclusive os R$ 85,00 de hoje) | R$ 1.335,93 |
| **Disponível real para saque agora** | **R$ 505,80** |
| Pendente — 100% rede de setembro, em carência | R$ 265,25 |
| Fitcoin (indicação, separado do financeiro) | R$ 40,00 |

Confirmações diretas às suas dúvidas:

- **Agosto bateu a meta** (150 pts de 50 exigidos) — a rede de agosto **já foi liberada** e está dentro dos R$ 505,80.
- **Setembro está em 0 de 50 pts.** Os R$ 265,25 são todos de rede de setembro: hoje estão em carência e, quando a carência vencer, passam a "rede bloqueada" até a meta de setembro ser batida. Não são venda direta.
- As três carteiras dela (coach R$ 348,95 + parceiro R$ 156,17 + profissional R$ 0,68) somam exatamente R$ 505,80 — o saldo está certo, o que está errado é **como isso é mostrado**.

## Por que "liberei 85 e apareceu 73"

A tela de antecipação lista as comissões **linha a linha da tabela bruta**, enquanto o extrato financeiro **deduplica** lançamentos repetidos da mesma venda. Ela tem hoje 6 linhas duplicadas somando R$ 13,31. Você selecionou R$ 85,00 de linhas, mas parte delas era duplicata que o extrato ignora — por isso o disponível subiu ~R$ 73 e você precisou liberar de novo. Não é dinheiro perdido: é a tela contando duas vezes o que o extrato conta uma.

## Correção

1. **Antecipação passa a usar o mesmo extrato deduplicado.** A lista de "liberar" mostra só lançamentos reais, com o valor que de fato vai entrar no disponível, e o total selecionado passa a bater exatamente com o que entra na carteira. Ao confirmar, mostrar "entrou R$ X no disponível" com o valor efetivo.
2. **Separar rede de venda direta em toda a tela.** Onde hoje aparece um "A liberar" único, passam a existir linhas distintas: *A liberar — venda direta*, *A liberar — rede (mês/ano)* e *Rede bloqueada — falta bater a meta*. Cada bloco de rede mostra o mês de referência e o estado da meta daquele mês ("agosto: batida, liberado" / "setembro: 0 de 50 pts, bloqueia após a carência").
3. **Um número só de disponível.** Lista de Pagamentos, modal e painel da pessoa passam a exibir sempre o disponível consolidado (coach + parceiro + profissional) vindo do extrato, com o detalhamento por origem logo abaixo — acabam os dois valores diferentes na mesma tela.
4. **Coerência na antecipação de rede.** Hoje a lista oferece comissões de rede de mês não batido e o banco recusa na hora de confirmar. Passam a aparecer marcadas como "exige exceção", com aviso claro antes de confirmar.
5. **Extrato de baixas individuais.** Cada saque pago passa a mostrar de qual origem saiu (coach/parceiro/profissional) e o saldo antes e depois, para conferência de baixa uma a uma.
6. **Limpar as duplicidades** de comissão dela e varrer todos os perfis com o mesmo padrão, registrando o que foi removido para auditoria.

## Como conferir depois

- Ana Flávia: disponível R$ 505,80 nos três lugares, pendente R$ 265,25 identificado como rede de setembro bloqueada por meta, Fitcoin R$ 40,00 à parte.
- Selecionar R$ X na antecipação e ver o disponível subir exatamente R$ X.
- Conferir mais dois perfis (um coach puro, um parceiro) sem divergência.

## Detalhes técnicos

- `listBlockedCommissions` passa a ler `financial_ledger_events` (rank 1) em vez de `commissions` cru; `admin_advance_commission_release` retorna o total efetivamente aplicado no extrato.
- Novos campos no `wallet_statement`: `hold_direct`, `hold_network`, `network_blocked_by_month` (array mês/ano/valor/meta batida).
- `WalletStatementCard.tsx`, `admin.payments.tsx` e `PayablesPanel.tsx` consomem esses campos; lista de pessoas usa `wallet_statement_bulk`.
- Migration de limpeza das comissões duplicadas com tabela de auditoria e recálculo (`recalc_wallets_for_owner`) dos perfis tocados.
- Verificação obrigatória: `node node_modules/typescript/bin/tsc --noEmit` mantendo os 15 erros da linha de base.
