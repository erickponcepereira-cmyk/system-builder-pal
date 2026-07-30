## 1. Duração do produto x blocos da agenda

Hoje a agenda do Helton é toda em blocos de 30 min (sex, 14:00–17:00) e ele tem 2 produtos com 60 min ("Consulta" e "Acompanhamento Nutricional"). O gerador de horários já junta blocos contíguos, então 60 min funciona — mas nada garante que a duração seja compatível com o bloco.

- No editor de produtos do profissional (e do parceiro, quando agendável): a duração passa a ser escolhida em múltiplos do bloco da agenda (30, 60, 90…), com o texto "sua agenda usa blocos de 30 min".
- Bloqueio de salvamento quando a duração não for múltiplo do bloco, com mensagem explicando o ajuste.
- Aviso quando a duração exigir mais blocos seguidos do que a maior janela contínua disponível (ex.: 90 min numa agenda com janelas de 60 min) — o produto salva, mas o profissional é avisado de que ninguém conseguirá agendar.
- Validação equivalente no servidor, ao criar/editar produto agendável.
- Os dois produtos de 60 min do Helton permanecem válidos (2 blocos de 30) — nada é alterado à força.

## 2. Mensagem de parabéns após a compra

Ao concluir uma compra (cartão, PIX aprovado ou pagamento por carteira), aparece um modal de sucesso com, na ordem:

- "Parabéns, você acabou de receber **X dias** de benefícios gratuitos, venha conferir!" + botão para a aba **Gratuitos** (X vem das regras já existentes de carteirinha por faixa de preço).
- Se o produto gerar ticket de desafio: "Você agora pode participar dos nossos desafios! Venha concorrer a R$ 1.000 no PIX!" + botão para a aba **Desafios**.
- "Converse com a empresa pelo WhatsApp e confira se está tudo certo!" + botão abrindo o WhatsApp do parceiro/profissional dono do produto (com fallback para o número oficial FitMind) já com a mensagem pré-preenchida:
  "Bom dia/Boa tarde/Boa noite, me chamo {primeiro nome}, acabei de comprar {nome do produto} pela FitMind, gostaria de saber se está tudo certo."

Cada bloco só aparece quando se aplica (sem dias de benefício → não mostra; sem ticket → não mostra; sem WhatsApp em lugar nenhum → não mostra o botão).

## 3. Tags de limite nos benefícios gratuitos

Nos cards de gratuitos (aba Gratuitos do aluno/coach, página pública `/gratuitos` e modal de detalhe), incluir as tags no mesmo estilo das tags de ticket da loja:

- "{n}x por semana" (weekly_limit_per_student)
- "{n}x por mês" (monthly_redeem_limit) — omitida quando ilimitado

## 4. Confirmação após reservar um gratuito

Ao concluir a reserva, substituir o toast simples por um modal:

"Parabéns por adquirir o produto **{nome}** gratuitamente! Converse com a empresa e veja se está tudo certo: **{número}**" + botão WhatsApp com a mensagem:
"Bom dia/Boa tarde/Boa noite, me chamo {primeiro nome}, acabei de comprar {nome do produto} para as {horário da reserva} pela FitMind, gostaria de saber se está tudo certo."

O trecho "para as {horário}" só entra quando a reserva tiver horário marcado.

## Detalhes técnicos

- Novo util `src/lib/purchase-messages.ts`: saudação por horário (America/Sao_Paulo), primeiro nome, montagem do texto e do link `wa.me` (reaproveitando `whatsappUrl`).
- Novo componente `PurchaseSuccessModal` usado por `MercadoPagoCheckout.tsx`, `WalletPayButton.tsx` e pelos fluxos de pedido de loja; dias/tickets vindos de `computePartnerProductBenefits`.
- Novo componente `FreebieReservedModal` usado por `PartnerFreebieBookingModal.tsx` / `FreebieDetailModal.tsx`.
- WhatsApp resolvido a partir de `partners.public_whatsapp` / `professional_public_profile.public_whatsapp`, com fallback num ajuste em `app_settings` (`fitmind_whatsapp`).
- Alterações de duração ficam em `ProfessionalProductsPanel.tsx`, no editor de produtos do parceiro e na validação do server function correspondente; sem mudança de schema.
