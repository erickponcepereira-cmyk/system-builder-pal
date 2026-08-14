# Auditoria de carteiras + Central de Pagamentos no Admin

## O que já foi verificado agora (dados reais)

- Comissões válidas (não-teste): 341 disponíveis somando R$ 3.377,38 e 213 pendentes somando R$ 1.367,02 (todas as pendentes com liberação prevista para agosto/2026).
- Comparando cada carteira de coach (`wallets`) com a soma das comissões da pessoa, **14 carteiras estão divergentes**, com diferença total de R$ 328,57 a menos nas carteiras do que o extrato de comissões indica.
- Ainda não foi apurado *por que* essas 14 divergem (saque aprovado sem baixa, comissão criada sem recálculo, ou lançamento manual). Isso é o primeiro passo da execução, não uma conclusão.

## O que será feito

### 1. Auditoria e correção das carteiras
- Rodar uma verificação completa comparando, pessoa a pessoa, o extrato de origem (comissões aprovadas, créditos de co-produção, saques aprovados) com o saldo gravado em cada carteira: coach (`wallets`), parceiro (`partner_wallets`), profissional (`professional_wallets`), aluno e nutricionista/professor.
- Listar cada divergência com nome, tipo de carteira, saldo gravado, saldo calculado e diferença — antes de corrigir.
- Corrigir as divergências pelo recálculo já existente no sistema, mantendo histórico do que foi ajustado.

### 2. Nova aba "Contas a pagar" em Admin → Pagamentos
Painel permanente, sem precisar pedir relatório novamente:

- **Resumo no topo**: total disponível para saque hoje, total pendente/bloqueado, total já solicitado aguardando pagamento, total pago no mês.
- **Por pessoa**: nome, perfil (coach / parceiro / profissional / aluno), disponível, pendente, já sacado, e a data em que o pendente vira disponível. Busca por nome e filtro por perfil e por estado (disponível, pendente, solicitado, pago).
- **Projeção de caixa**: quanto vira disponível em cada mês futuro, com base na data de liberação de cada comissão pendente — para saber quanto dinheiro precisa estar em caixa e quando.
- **Fila de pagamento**: solicitações de saque em aberto por status (solicitado, aprovado, processando, pago, rejeitado), com valor e data.
- **Consistência**: aviso destacado quando alguma carteira voltar a divergir do extrato, com botão de recálculo.
- Exportar qualquer visão em CSV.

### 3. Relatório inicial
Entregar, junto com a entrega, o retrato atual: total a pagar, disponível, bloqueado, projeção por mês e lista das divergências corrigidas.

## Observações técnicas

- Toda a leitura roda no servidor (`createServerFn` com verificação de admin), reaproveitando `src/lib/admin-payouts.functions.ts`; a nova aba entra em `src/routes/_authenticated/admin.payments.tsx` seguindo o padrão visual das abas atuais.
- A projeção usa `commissions.available_at` como data de liberação e ignora registros de teste (`is_test`).
- Nada de comissão, split ou regra de venda é alterado — apenas leitura, conferência e o recálculo de saldo já existente.
