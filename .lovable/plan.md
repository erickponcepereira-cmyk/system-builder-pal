## Objetivo

Na aba **Desafio** do aluno, quando ele não tem acesso (bloco "Desafio Indisponível"), mostrar logo abaixo:

> "Adquira o ticket do desafio para participar dessa edição:"

seguido de um card do produto **Ticket Desafio Tradicional** com botão de compra que abre o checkout Mercado Pago **na própria aba** — após pagamento aprovado, a página recarrega os dados e o desafio é habilitado sem sair da tela.

## Arquivo a alterar

- `src/routes/_authenticated/student.challenge.tsx`

Nenhuma alteração de banco, RPC ou lógica de comissões. A compra reutiliza a RPC `create_store_order` já usada em toda a loja (kind `challenge`, sourceId do produto), e o componente `MercadoPagoCheckout` já existente.

## Mudanças

1. **Buscar o produto Ticket Desafio Tradicional** no `useEffect` de carregamento da página:
   - `supabase.from("products").select("id,name,price,image_url").eq("id","1a5b055d-5842-4b7a-b856-7f0babd1c04f").eq("status","active").maybeSingle()`
   - Guardar em `ticketProduct` (state).

2. **Estados novos**:
   - `ticketProduct: { id, name, price, image_url } | null`
   - `payOrder: { id, number, total, email, name } | null` — pedido pendente de pagamento
   - `buying: boolean`
   - `paymentMethod: "pix" | "credit_card"` (default `pix`)

3. **Novo bloco de compra** (renderizado dentro do card "Desafio Indisponível", logo após o texto atual):
   - Texto: "Adquira o ticket do desafio para participar dessa edição:"
   - Card compacto com nome do produto, preço formatado e seletor Pix / Cartão.
   - Botão **"Comprar ticket — R$ 100,00"**.

4. **Handler `handleBuyTicket`**:
   - `create_store_order` com `[{ kind: "challenge", sourceId: ticketProduct.id, quantity: 1 }]` e `_payment_method`.
   - Ler `store_orders` (id, order_number, total_amount) e salvar em `payOrder`.
   - Tratamento de erro com `toast.error`.

5. **Renderizar `MercadoPagoCheckout` inline** logo abaixo do card de compra quando `payOrder` existe:
   - `source={{ kind: "store_order", id: payOrder.id }}`, `amount`, `description`, `defaultPayer`, `initialMethod={paymentMethod}`.
   - `onApproved`: fecha o checkout, toast "Ticket adquirido! Desafio liberado.", chama a função interna `load()` (que já recarrega `hasAccess`, `tokens`, `enrollment`), permanecendo na mesma tela — a UI muda automaticamente do bloco de bloqueio para a UI de tickets/inscrição.

6. **Sem side-effects fora do card**: nada muda no fluxo pra quem já tem acesso ou já está inscrito; a nova UI só aparece na branch `!hasAccess && !(tokens && tokens.balance > 0)`.

## Observações

- O produto "Ticket Desafio Tradicional" (id `1a5b055d-…`) já concede `challenge_tokens_amount: 1` e tem `has_challenge_access: true`, então o backend existente (trigger que credita ticket após pagamento aprovado) já habilita o desafio — não precisa criar novo caminho.
- Fallback: se o produto não estiver `active` no banco, o bloco extra é omitido e mantém o texto original "Fale com seu coach".
