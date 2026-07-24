## Plano de correção definitiva das carteiras

### Diagnóstico confirmado
- O painel mostra o saldo disponível somando carteiras diferentes: Coach + Parceiro + Profissional.
- A baixa/validação de saque está verificando saldos por carteira isolada em alguns fluxos.
- Para o Erick, o saldo exibido veio de mais de uma carteira: R$ 176,80 na carteira Coach + R$ 0,44 na carteira Parceiro = R$ 177,24. A baixa falha porque uma validação usa só um bucket.
- Compras/mensalidades pagas com carteira precisam ser registradas como débito interno nos relatórios e também entrar no recálculo do saldo do comprador.

### O que vou alterar
1. **Unificar o cálculo de saldo disponível**
   - Criar/atualizar a lógica do banco para considerar sempre o saldo total sacável do usuário: Coach + Parceiro + Profissional.
   - Evitar que a interface mostre um valor que o backend depois recuse.

2. **Corrigir baixa de saque no admin**
   - Ajustar a função de baixa para debitar em cascata das carteiras do usuário.
   - Ordem de consumo: Coach → Parceiro → Profissional.
   - Exemplo: se o usuário tem R$ 176,80 em Coach e R$ 0,44 em Parceiro, um saque de R$ 177,24 será aceito e debitado corretamente.

3. **Corrigir pagamentos com carteira interna**
   - Registrar em cada mensalidade/compra o breakdown real do débito:
     - quanto saiu da carteira Coach;
     - quanto saiu da carteira Parceiro;
     - quanto saiu da carteira Profissional.
   - Isso garante rastreabilidade em relatórios.

4. **Corrigir recálculo de carteiras**
   - Atualizar o recálculo central para descontar:
     - saques pagos;
     - saques pendentes/aprovados/processando;
     - mensalidades pagas com carteira;
     - compras da loja pagas com carteira;
     - pedidos de parceiro/profissional pagos com carteira.
   - Incluir triggers para recalcular o comprador quando um pedido pago com carteira for criado/alterado.

5. **Reconciliar todas as carteiras**
   - Rodar o recálculo para todos os perfis com qualquer movimentação financeira, não só quem tem comissões.
   - Validar depois os saldos do Erick e uma amostra geral para garantir que o valor mostrado bate com o valor sacável.

6. **Ajustar o código do admin se necessário**
   - Atualizar `registerManualPayout` para validar contra o saldo agregado, não contra apenas uma tabela.
   - Revisar o fluxo de pagamento manual para usar a mesma regra do banco.

### Resultado esperado
- O valor exibido no admin será exatamente o valor que pode ser baixado.
- Saques poderão consumir saldo de múltiplas carteiras sem erro falso de saldo insuficiente.
- Pagamentos com carteira aparecerão nos relatórios como carteira interna, com origem do débito registrada.
- Recalcular carteiras não ficará mudando valores de forma inesperada por ignorar algum tipo de débito.