## Diagnóstico confirmado

O erro `column "upline_l1_coach_id" does not exist` vem das funções de compra da loja unificada de parceiro/profissional.

Conferi o banco atual:
- A tabela `coaches` tem apenas `upline_coach_id` para a rede.
- As funções `create_partner_company_order`, `create_partner_product_order` e `create_scheduled_professional_order` estão tentando ler `upline_l1_coach_id`, `upline_l2_coach_id` e `upline_l3_coach_id` diretamente de `coaches`.
- Esses campos existem em `partner_product_orders`, mas não existem em `coaches`.

Por isso começou a acontecer depois da união das lojas: a compra passou a cair no fluxo unificado de pedidos de parceiro/profissional, que hoje está usando uma lógica antiga de rede incompatível com o schema real.

## Plano de correção

1. **Corrigir a lógica de rede no backend**
   - Criar uma migração para substituir as funções de compra quebradas.
   - Em vez de buscar `coaches.upline_l1_coach_id`, `upline_l2_coach_id`, `upline_l3_coach_id`, calcular os níveis assim:
     - nível 1 = `coaches.upline_coach_id` do vendedor
     - nível 2 = `upline_coach_id` do nível 1
     - nível 3 = `upline_coach_id` do nível 2
   - Continuar gravando esses valores corretamente em `partner_product_orders.upline_l1_coach_id`, `upline_l2_coach_id`, `upline_l3_coach_id`.

2. **Aplicar a correção em todos os caminhos de compra afetados**
   - Produto pago de parceiro.
   - Produto pago de profissional.
   - Produto profissional agendável.
   - Compra feita por aluno e compra feita por revendedor/coach para aluno.

3. **Preservar o fluxo atual do Mercado Pago**
   - Não trocar o checkout nem mexer nas credenciais.
   - Manter PIX/cartão usando o mesmo componente atual.
   - A correção será antes do checkout: criação correta do pedido para que o pagamento consiga abrir sem erro.

4. **Melhorar a mensagem de erro no carrinho**
   - Onde hoje aparece o erro técnico cru do banco, mostrar uma mensagem limpa para o usuário caso a criação do pedido falhe.
   - Manter o erro técnico apenas em log/diagnóstico.

5. **Validar depois da correção**
   - Testar criação de pedido para produto de parceiro.
   - Testar criação de pedido para produto de profissional.
   - Testar produto agendável, se houver disponível.
   - Confirmar que o pedido entra em `partner_product_orders` com vendedor, uplines e valores preenchidos.
   - Confirmar que o checkout PIX/cartão abre a partir desse pedido.