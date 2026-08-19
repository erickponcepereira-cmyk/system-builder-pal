# Correção definitiva do fluxo de saques

## Diagnóstico confirmado

A tela do coach exibe o saldo consolidado de todas as carteiras do mesmo perfil. No caso reproduzido, ela soma **R$ 2,83 da carteira principal** com **R$ 808,98 da carteira de parceiro**, exibindo corretamente **R$ 811,81**.

Ao confirmar, porém, `requestSellerWithdrawal` valida apenas a carteira principal quando a origem é `coach`. Por isso o backend responde **“Saldo disponível insuficiente (R$ 2,83)”**, mesmo que o saldo consolidado mostrado na tela esteja disponível.

## Implementação

1. **Criar uma única operação atômica de solicitação de saque no banco**
   - Bloquear as carteiras do perfil durante a operação.
   - Somar os saldos disponíveis das carteiras principal, parceiro, profissional e aluno indicador.
   - Validar mínimo de R$ 50, bloqueios e solicitação já aberta.
   - Criar a solicitação dentro da mesma transação, evitando divergências e solicitações duplicadas por concorrência.

2. **Unificar a definição de saldo sacável**
   - Fazer a tela, o envio da solicitação, a aprovação e a baixa usarem exatamente a mesma composição de carteiras.
   - Manter as comissões de rede bloqueadas fora do saldo sacável até a missão ser concluída.
   - Preservar o rastreamento da origem do dinheiro para a baixa e os relatórios financeiros.

3. **Simplificar o servidor de saques**
   - Substituir a validação isolada por carteira em `requestSellerWithdrawal` pela operação atômica.
   - Remover a janela em que o saldo pode mudar entre a leitura e a criação do pedido.
   - Retornar ao modal o saldo consolidado real e mensagens específicas apenas quando houver falta efetiva de saldo.

4. **Garantir consistência após cada mudança de status**
   - Ao solicitar, cancelar, rejeitar, aprovar ou pagar, recalcular todas as carteiras do titular uma única vez.
   - Garantir que valores reservados não sejam descontados duas vezes e que cancelamentos devolvam imediatamente o disponível.

5. **Validar o cenário real e as regressões**
   - Reproduzir o perfil da captura: R$ 2,83 principal + R$ 808,98 parceiro = R$ 811,81 sacáveis.
   - Testar saque integral, parcial, abaixo de R$ 50, acima do saldo, cancelamento e nova solicitação.
   - Testar aprovação/pagamento e confirmar carteira, histórico e relatório administrativo sem duplicidade.
   - Verificar separadamente perfis apenas coach, apenas parceiro, profissional e perfis com múltiplas carteiras.

## Resultado esperado

O valor mostrado como disponível será sempre o mesmo valor aceito pelo saque. No caso atual, a solicitação de **R$ 811,81** será validada contra o total consolidado, e não apenas contra os **R$ 2,83** da carteira principal.