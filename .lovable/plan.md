Vou corrigir o fluxo de pagamento Mercado Pago sem mexer em regras financeiras que já estão funcionando.

1. Corrigir o erro imediato do cartão recorrente
- O erro da imagem vem do parâmetro 3DS enviado ao Mercado Pago: o código atual envia `three_ds_mode`, mas a documentação atual exige `three_d_secure_mode`.
- Ajustar o payload do pagamento com cartão para usar o nome correto.
- Manter `capture: true` e `binary_mode: false`, que são necessários para 3DS com desafio.

2. Revisar o fluxo de recorrência com cartão salvo
- Conferir a criação da primeira cobrança recorrente: pagamento aprovado, cartão salvo e assinatura criada.
- Conferir cobrança futura/manual: token de cartão salvo, pagamento direto, registro em `recurring_charges`, atualização de `next_charge_at` e contagem de falhas.
- Garantir que a cobrança recorrente não envie parâmetros incompatíveis com cartão salvo.

3. Revisar PIX e pagamento único
- Verificar que a correção não afeta PIX.
- Verificar que pagamento único no cartão continua funcionando com 3DS opcional.
- Manter deduplicação de tentativas rejeitadas/aprovadas para não duplicar pedidos.

4. Melhorar mensagens de erro na tela
- Traduzir mensagens técnicas do Mercado Pago como `wrong parameters`/`three_ds_model` para uma mensagem clara em português.
- Preservar detalhes internos suficientes nos logs, sem mostrar erro cru para o cliente.

5. Validação final
- Rodar verificação de código focada nos arquivos de Mercado Pago.
- Conferir que o payload final para cartão usa o parâmetro correto e que os fluxos recorrente/pagamento único compartilham a mesma correção.