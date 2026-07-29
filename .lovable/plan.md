Plano para corrigir as recusas recorrentes por análise de risco no Mercado Pago sem quebrar PIX, pagamento único e recorrência:

1. Separar pagador da conta e titular do cartão
- Hoje o checkout envia para o Mercado Pago o nome/e-mail/documento do cadastro como pagador.
- Isso aumenta recusa quando o cartão é de outra pessoa, porque o CPF/nome do cadastro pode divergir do titular do cartão.
- Ajustar o fluxo para usar os dados retornados pelo Brick do Mercado Pago como dados principais do titular/pagador do cartão, e não sobrescrever com o nome do cadastro.

2. Remover enriquecimento antifraude incompatível com cartão de terceiro
- O backend hoje busca telefone/endereço/data de cadastro pelo e-mail do perfil e injeta em `additional_info.payer`.
- Para cartão, isso pode piorar o score quando o cartão pertence a outra pessoa.
- Manter itens/produtos no `additional_info`, mas para cartão só enviar dados de pessoa quando forem consistentes com o titular informado no formulário.
- Preservar PIX como está, pois PIX não depende da mesma validação de cartão.

3. Melhorar o payload do cartão
- Garantir que `payer.email`, `payer.first_name`, `payer.last_name` e `payer.identification` reflitam o titular preenchido no formulário de cartão.
- Manter `deviceId`, `X-meli-session-id`, `capture: true`, `binary_mode: false` e `three_d_secure_mode: optional` para reduzir risco.
- Em recorrência inicial, salvar o cartão só depois de pagamento aprovado.
- Em cobrança recorrente futura com cartão salvo, continuar sem 3DS interativo.

4. Ajustar a experiência da tela
- Adicionar uma orientação curta no checkout informando que, se o cartão for de outra pessoa, os dados no formulário devem ser do titular do cartão.
- Quando vier `cc_rejected_high_risk`, exibir mensagem clara em português e orientar a tentar com dados do titular, outro cartão ou PIX.

5. Revisar pontos de entrada
- Conferir todos os usos de `MercadoPagoCheckout` para garantir que o `defaultPayer` continue útil para e-mail inicial, mas não force nome/CPF errado no cartão.
- Não mexer em regras financeiras, comissões, carteiras, pedidos ou assinaturas além do necessário para o payload do Mercado Pago.

6. Validação
- Procurar no código se ainda existe envio de `three_ds_mode` antigo ou dados de cadastro sobrescrevendo titular do cartão.
- Verificar o fluxo por leitura/checagem focada nos arquivos de Mercado Pago.

Detalhe técnico: a principal mudança será no `MercadoPagoCheckout.tsx` e no `mercadopago-impl.server.ts`, separando `payer` de cadastro do `cardholder/payer` efetivamente retornado pelo Brick para cartão.