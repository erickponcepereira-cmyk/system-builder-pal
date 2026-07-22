## Diagnóstico confirmado

- No cadastro da Luana Martins (`lumartinssantana@gmail.com`), a mensalidade atual está **pendente** e vinculada à última tentativa de cartão recusada.
- As tentativas de mensalidade foram recusadas pelo Mercado Pago com `cc_rejected_high_risk`.
- A anuidade teve várias tentativas/pedidos antigos pendentes; uma tentativa posterior de anuidade foi aprovada. Isso deixa o fluxo confuso porque pedidos/faturas antigos continuam existindo e o app não oferece uma ação clara de “nova tentativa limpa”.
- Pelo que foi verificado, o erro da mensalidade não parece ser “cobrança duplicada” em si; é uma recusa de risco do cartão. Mas o sistema precisa tratar isso melhor para o usuário não ficar preso.

## Plano de correção

1. **Corrigir o checkout para tentativas recusadas**
   - Quando Mercado Pago retornar `cc_rejected_high_risk` ou outra recusa de cartão, mostrar mensagem amigável em português.
   - Orientar a pessoa a tentar PIX, outro cartão ou uma nova tentativa, em vez de deixar o erro técnico na tela.
   - Não manter uma tentativa recusada como se fosse a tentativa “ativa” da fatura.

2. **Adicionar “Gerar nova tentativa de pagamento” para mensalidade**
   - Criar uma ação segura que limpa o vínculo da fatura com pagamento recusado/cancelado e mantém a fatura pendente.
   - Não duplicar a mensalidade do mesmo mês.
   - Resetar status bloqueado/atrasado para pendente quando o admin já adiou ou liberou uma nova tentativa válida.
   - Registrar a ação no histórico da fatura.

3. **Melhorar anuidade/ativação para não acumular pedidos soltos**
   - No fluxo de Coach, Profissional e Parceiro, antes de criar novo pedido de anuidade, procurar um pedido pendente existente do mesmo usuário/produto.
   - Se o pedido antigo estiver com pagamento recusado/cancelado, permitir nova tentativa limpa no mesmo pedido ou criar uma nova tentativa sem bloquear o usuário.
   - Evitar vários pedidos pendentes antigos aparecendo como possíveis cobranças abertas.

4. **Adicionar ação no Admin > Mensalidades**
   - Na lista de faturas pendentes/atrasadas/bloqueadas, incluir botão “Nova tentativa”.
   - Esse botão será usado quando o pagamento ficou preso em uma tentativa recusada ou antiga.
   - Manter os botões atuais de “Adiar”, “Pago PIX”, “Pago Cartão”, “Isentar” e “Restaurar data”.

5. **Ajustar a mensalidade atual da Luana**
   - Depois da correção estrutural, limpar a tentativa recusada vinculada à fatura atual dela e deixá-la pronta para nova tentativa de pagamento.
   - Como você adiou manualmente, a correção deve preservar o novo vencimento e permitir que ela pague sem criar uma mensalidade duplicada.

6. **Validação**
   - Conferir no banco que a fatura da Luana continua única para o mês atual.
   - Conferir que pagamentos recusados continuam no histórico, mas não travam novas tentativas.
   - Conferir que anuidade e mensalidade conseguem abrir novo checkout após recusa.