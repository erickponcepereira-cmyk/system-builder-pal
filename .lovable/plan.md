# Correção urgente do link de pagamento da venda Master Coach

## Diagnóstico confirmado

- A Francisca possui vários pedidos recentes do produto **Condomínio Chapada do Poente**, todos com números reais `PP-*` no banco.
- O pedido mais recente e sua API pública carregam corretamente quando o número real é usado; portanto, “Pedido não encontrado” acontece porque algum caminho da venda ainda compartilha o link antigo `/pay/pedido` em vez do número retornado.
- Embora a venda tenha sido iniciada pela Kátia, os pedidos estão sendo gravados com o Adriano como `selling_coach_id`. O fluxo atual resolve o coach do aluno e perde a identidade da Master Coach vendedora.

## Correção

1. **Tornar a criação da venda atômica e devolver o link correto**
   - Ajustar a função de criação do pedido profissional para registrar o coach logado como vendedor quando a venda for feita em modo Master Coach.
   - Manter o Adriano como coach titular da Francisca e dono/rede do produto, sem substituir esse vínculo.
   - Fazer a função retornar, numa única resposta, `order_id`, `order_number` e o caminho `/pay/PP-...`, eliminando a leitura posterior sujeita a falha de permissão ou estado desatualizado.

2. **Eliminar definitivamente `/pay/pedido`**
   - Atualizar a loja usada pela Master Coach para consumir diretamente o número e o link devolvidos pela criação.
   - Bloquear os botões de copiar e enviar por WhatsApp se o valor não corresponder a um número real de pedido.
   - Remover qualquer fallback genérico restante nesse fluxo; uma falha deve mostrar erro e permitir tentar novamente, nunca gerar link inválido.

3. **Fortalecer a rota pública de pagamento**
   - Normalizar o parâmetro recebido e buscar pedidos profissionais e da loja pelo número real.
   - Diferenciar link inválido de pedido inexistente e registrar informação suficiente para diagnosticar novas ocorrências sem expor dados do cliente.

4. **Tratar as tentativas duplicadas da Francisca**
   - Manter o pedido mais recente como pendente e cancelar os pedidos pendentes anteriores do mesmo produto/cliente, evitando múltiplas cobranças possíveis.
   - Não alterar pedidos já pagos.

## Validação

- Simular a Kátia vendendo o produto do Adriano para uma cliente da rede dele.
- Confirmar que a venda preserva: Kátia como vendedora Master Coach, Adriano como coach titular/dono da rede e Francisca como compradora.
- Abrir o link copiado e o link enviado por WhatsApp em sessão anônima e confirmar produto, cliente, valor de R$ 20,00 e checkout.
- Verificar que nenhuma interface ou mensagem produz `/pay/pedido`.