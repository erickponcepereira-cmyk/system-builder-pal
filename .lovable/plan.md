# Lista de compradores por produto

Mostrar, para cada produto de parceiro ou profissional, quem comprou — útil em produtos com estoque limitado (ex: aulão de jump do Léo).

## O que aparece

Uma lista com:
- Nome do comprador
- Telefone (com link direto de WhatsApp)
- Data da compra
- Coach vendedor (quem indicou/vendeu)
- Valor da compra e status (pago / pendente)

Total de vendas pagas e vagas restantes no topo da lista.

## Quem vê

- O dono do produto (parceiro ou profissional).
- O co-produtor aceito daquele produto (somente leitura, mesma lista).

Ninguém mais tem acesso: a busca é validada no servidor antes de retornar qualquer dado pessoal.

## Onde fica

Botão "Compradores" no card de cada produto, dentro do painel de produtos do parceiro e do profissional. Abre um modal com a lista, com busca por nome e ordenação pela data mais recente.

## Detalhes técnicos

- Novo `src/lib/product-buyers.functions.ts` com `listProductBuyers` (`createServerFn` + `requireSupabaseAuth`):
  - valida se o usuário é dono (`partner_products.partner_id` / `professional_products` do profissional) ou co-produtor aceito em `product_coproductions` (status `accepted`);
  - só depois carrega via cliente admin os pedidos de `partner_product_orders` (`student_id`, `selling_coach_id`, `paid_at`, `created_at`, `status`, `gross_amount`) filtrados pelo `partner_product_id`/`professional_product_id`;
  - hidrata nome/telefone a partir de `students` → `profiles`, e nome do coach vendedor a partir de `coaches` → `profiles`;
  - retorna apenas os campos necessários (sem CPF, sem e-mail).
- Novo `src/components/products/ProductBuyersModal.tsx` usando `ModalShell` (padrão iOS safe-area já adotado no projeto), com `useQuery` chamando a função via `useServerFn`.
- Botão adicionado em `src/components/professional/ProfessionalProductsPanel.tsx` e no painel equivalente de produtos do parceiro, além do card de produto em modo co-produtor (leitura).
