## O que vai mudar

Hoje `partner_products` e `professional_products` não têm vínculo com a taxonomia da loja (`store_sections` + `store_categories`). Vou amarrar essa ligação, permitir criar categorias na hora (entram pendentes) e exibir os produtos aprovados em abas próprias dentro das lojas existentes.

## Banco (1 migration)

- `partner_products`: adicionar `section_id uuid`, `category_id uuid` (FKs → `store_sections` / `store_categories`, `ON DELETE SET NULL`).
- `professional_products`: idem.
- `store_sections` e `store_categories`: adicionar `created_by uuid`, `pending boolean default false`.
  - Quando partner/profissional cria uma seção/categoria nova, ela entra com `pending = true` e `is_active = false`.
  - Admin aprova em `/admin/store` (toggle "ativar" já existe — vou só destacar as pendentes).
- RLS:
  - Permitir `INSERT` em `store_sections`/`store_categories` para coach/parceiro/profissional autenticado, mas só com `pending = true, is_active = false`.
  - `SELECT` das pendentes liberado para o criador + admin (para mostrar o status na UI dele).
  - Produto só é "aprovado de fato e visível" quando: `status = 'approved'` E categoria vinculada está `is_active = true`.

## Frontend

### Criação de produto (partner.tsx + ProfessionalProductsPanel.tsx)

Adicionar 2 selects no formulário "Novo produto patrocinado pago":
- Seção (com botão "+ nova seção" → modalzinho com nome → cria pendente)
- Categoria (filtrada pela seção; com botão "+ nova categoria")

Mensagem: "Categorias novas ficam pendentes até o admin aprovar."

### Loja (StorePage.tsx — usada em aluno, coach, profissional, parceiro)

Adicionar tabs no topo:
- **FitMind** (conteúdo atual da loja, sem mudança)
- **Parceiros** — grid agrupado por seção → categoria com produtos `partner_products` aprovados + categoria ativa
- **Profissionais** — idem para `professional_products`

Card mostra preço bruto (`price`), imagem, nome do parceiro/profissional, botão "ver detalhes".

### Admin

- `/admin/store` (StoreManager): badge "Pendente" nas seções/categorias com `pending = true` e botão rápido "Aprovar" que faz `pending=false, is_active=true`.

## Arquivos tocados

- migration nova
- `src/routes/partner.tsx` (form de criação)
- `src/components/professional/ProfessionalProductsPanel.tsx` (form de criação)
- `src/components/student/StorePage.tsx` (tabs + fetch novos)
- `src/components/admin/StoreManager.tsx` (badge + botão aprovar)
- novo: `src/components/store/CategoryPickerWithCreate.tsx` (reutilizado nos dois forms)

## Fora do escopo desta rodada

- Checkout dos produtos aprovados (segue a infra de `partner_product_orders` que já existe).
- Reordenação manual dentro de cada categoria.