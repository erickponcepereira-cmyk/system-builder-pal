# Pop-up de "venda aprovada" em todas as compras

O pop-up foi implementado, mas só ficou ligado em **um** lugar: a loja do coach (`PartnerProfessionalStore`). Nas demais telas de pagamento aparece apenas o toast "Pagamento aprovado!", por isso parece que se perdeu.

Onde ele NÃO aparece hoje:
- Loja do aluno (`StorePage`) — dois checkouts: compra do próprio aluno e venda do coach para o cliente
- Loja pública / carrinho (`/loja`)
- Página de pagamento por link (`/pay/{numero}`)
- Pagamento com saldo da carteira (WalletPayButton) na loja do aluno
- PIX confirmado depois, quando a pessoa já fechou o modal

## O que será feito

1. Reaproveitar o mesmo `PurchaseSuccessModal` (mesmo texto, mesmos blocos de carteirinha/tickets e o botão de WhatsApp com a mensagem padrão de saudação) em todos os pontos acima.
2. Suportar carrinho com vários itens: o pop-up passa a listar os produtos comprados e mostra um botão de WhatsApp por dono de produto (parceiro/profissional), além dos benefícios somados (dias de carteirinha e tickets).
3. Incluir produtos FitMind (store_order), que hoje nem chegam ao pop-up; sem WhatsApp de dono, mostram só a confirmação e os benefícios.
4. Disparar o pop-up também quando o pagamento é aprovado por saldo em carteira e quando o PIX é confirmado com o modal ainda aberto.
5. Na página `/pay/{numero}`, mostrar o mesmo pop-up ao mudar para "pago".

## Detalhes técnicos

- `PurchaseSuccessModal` ganha uma prop alternativa `items: { productId, productName, price, kind }[]` (mantendo a assinatura atual para não quebrar a loja do coach) e busca os contatos em lote via `getProductContact`.
- `StorePage`: guardar os itens pagos no estado `purchased` junto com `payOrder` (já existe `paidItemIds`) e renderizar o modal nos dois blocos de checkout (linhas ~1076 e ~1585), tanto em `onApproved` quanto em `onPaid` da carteira.
- `/loja` (carrinho público) e `/pay/$orderNumber`: exibir o modal após confirmação, usando os itens do pedido retornados pela API pública.
- Sem mudanças em preço, comissão, estoque ou lógica de pagamento — apenas apresentação pós-pagamento.
