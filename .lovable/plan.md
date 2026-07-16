## Problema confirmado

O fluxo quebrou porque o webhook do Mercado Pago pode chegar antes da tela terminar de registrar o PIX. Quando isso acontece, o backend cria um registro local do pagamento apenas com status, mas sem `pix_qr_code`, `pix_qr_code_base64` e `ticket_url`. Depois, ao clicar para gerar PIX novamente, o sistema reaproveita esse pagamento pendente “quebrado” e a tela mostra **QR Code não retornado**.

Também há risco operacional porque a chave de idempotência atual do PIX é fixa por fatura/pedido; se a primeira tentativa fica sem QR, novas tentativas podem continuar presas no mesmo pagamento.

## Plano de correção

1. **Corrigir a reutilização de PIX pendente**
   - Só reaproveitar um PIX pendente se ele tiver pelo menos o código copia-e-cola ou imagem/base64 do QR.
   - Se existir PIX pendente sem QR, tratar como tentativa inválida para a tela e criar uma nova tentativa segura.

2. **Evitar duplicidade real de cobrança**
   - Antes de criar novo PIX, consultar tentativas existentes da mesma fatura/pedido.
   - Bloquear apenas pagamentos já aprovados.
   - Permitir nova geração quando a tentativa anterior ficou sem QR, expirou, foi cancelada/rejeitada ou está inutilizável.

3. **Corrigir corrida com webhook**
   - Quando o webhook criar ou atualizar um pagamento PIX, também salvar os dados do QR quando eles vierem do Mercado Pago.
   - Assim, mesmo se o webhook chegar primeiro, o registro local fica completo e a tela consegue reaproveitar corretamente.

4. **Fortalecer retorno do PIX**
   - Após criar o pagamento no Mercado Pago, validar se o retorno possui QR antes de considerar a criação bem-sucedida para o usuário.
   - Se o provedor retornar resposta incompleta, marcar/localizar a tentativa como inutilizável em vez de deixar o usuário preso no erro.

5. **Corrigir o caso atual já quebrado**
   - Atualizar o registro pendente recente que está sem QR usando os dados que já chegaram no webhook, ou deixá-lo elegível para nova geração sem bloquear a fatura.

6. **Validar o fluxo**
   - Confirmar no banco que novas tentativas PIX de `subscription_invoice` ficam com QR salvo.
   - Conferir que pagamentos aprovados continuam idempotentes e não reprocessam a fatura duas vezes.
   - Verificar que cartão e demais fontes (`store_order`, `transaction`, `partner_product_order`) não sejam afetados.

## Arquivos/áreas afetadas

- `src/lib/mercadopago-impl.server.ts`: lógica de criação/reuso de PIX e atualização de registros.
- `src/routes/api.public.mp.webhook.ts`: persistência dos dados de QR recebidos pelo webhook.
- Banco de dados: ajuste pontual no registro de pagamento PIX quebrado atual, se necessário.

## Resultado esperado

Ao clicar em **Pagar com PIX**, o sistema deve sempre mostrar o QR/copia-e-cola quando o Mercado Pago gerar o pagamento; tentativas quebradas não devem travar a fatura, e pagamentos já aprovados não devem duplicar processamento.