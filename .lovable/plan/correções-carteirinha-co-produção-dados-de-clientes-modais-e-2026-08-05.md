# Lista de compradores por produto

Produtos com vaga/estoque (ex.: aulão de jump) passam a ter uma lista de quem comprou, visível para o dono do produto e para o co-produtor aceito.

## O que aparece na lista

Para cada compra paga do produto:

- Nome do comprador
- Telefone (com botão de WhatsApp)
- Data da compra
- Coach vendedor (quem indicou/vendeu); "Venda direta" quando não houver
- Valor pago e forma de pagamento
- Status (pago / pendente)

Ordenada da compra mais recente para a mais antiga, com contagem no topo (ex.: "12 compradores").

## Onde aparece

- Painel do Parceiro → Produtos: botão "Compradores" em cada produto.
- Painel do Profissional → Produtos: mesmo botão.
- Colaboração → Produtos co-produzidos (visão somente-leitura do co-produtor): mesmo botão, mesma lista.

A lista abre em um modal padrão do app, com botão para exportar em CSV.

## Detalhes técnicos

- Nova server function `listProductBuyers` em `src/lib/collab.functions.ts` (ou novo `product-buyers.functions.ts`), com `requireSupabaseAuth`.
  - Entrada: `{ productType: "partner" | "professional", productId }`.
  - Autorização: o perfil do chamador precisa ser (a) o dono do produto (`partner_products.partner_id` / `professional_products` → coach) ou (b) colaborador com `product_coproductions.status = 'accepted'` para aquele produto. Caso contrário, erro de permissão.
  - Após autorizar, usa o cliente admin para ler `partner_product_orders` filtrando por `partner_product_id` ou `professional_product_id`, status em `paid/preparing/shipped/delivered` (mais pendentes marcados), respeitando o corte do Modo de Testes (`is_test`).
  - Junta `profiles` (nome, telefone) via `student_id` e o nome do coach vendedor via `selling_coach_id` → `coaches.profile_id` → `profiles.name`.
  - Retorna apenas os campos listados acima — sem e-mail, sem CPF, sem dados financeiros da rede.
- Novo componente `src/components/shared/ProductBuyersModal.tsx` usando `ModalShell`, com tabela responsiva, link `wa.me` e exportação CSV no cliente.
- Botão adicionado em `ProductsPanel` (partner.tsx), `ProfessionalProductsPanel.tsx` e na lista de produtos co-produzidos.

Sem migração de banco: o acesso é controlado dentro da server function.
