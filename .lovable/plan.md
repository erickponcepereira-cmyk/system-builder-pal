# Produto restrito à rede de um coach

Permitir que um produto (de parceiro ou de profissional) só apareça para os alunos vinculados diretamente a determinados coaches — começando pelo produto do Adriano.

## Como vai funcionar

- No admin, ao abrir um produto para revisão/edição, aparece um bloco novo: **Visibilidade por rede**.
  - Padrão: "Todos" (comportamento atual, nada muda nos produtos existentes).
  - Opção: "Somente redes selecionadas" + lista de coaches permitidos (busca por nome, múltipla seleção).
- Com a restrição ligada:
  - **Aluno logado**: o produto só aparece na loja se o coach responsável dele for um dos coaches permitidos (vínculo direto, não downline).
  - **Loja pública / link compartilhado**: o produto só aparece quando o visitante chega por um link de indicação de um coach permitido; sem link, ou com link de outro coach, o produto não é listado.
  - **Link direto do produto**: quem não é da rede permitida vê "produto indisponível" em vez da tela de compra.
  - **Compra**: a validação é refeita no servidor no momento do pedido, então ninguém compra fora da rede mesmo forçando o link.
- O dono do produto (parceiro/profissional) e o admin continuam vendo o produto nos próprios painéis, com um selo indicando que ele é restrito.

## Detalhes técnicos

Migração:
- Adicionar em `partner_products` e `professional_products`:
  - `restrict_to_networks boolean not null default false`
  - `allowed_coach_ids uuid[] not null default '{}'`
- Atualizar as RPCs de catálogo público (`catalogo_publico`, `catalogo_publico_produto`) para aceitar um parâmetro opcional `_coach_id` e filtrar: `not restrict_to_networks or _coach_id = any(allowed_coach_ids)`.
- Atualizar `create_partner_product_order`, `create_scheduled_professional_order` e `create_partner_company_order` para rejeitar a compra quando o produto for restrito e o `coach_id` do aluno comprador não estiver em `allowed_coach_ids`.

Frontend:
- `src/components/admin/ProductReviewModal.tsx`: novo bloco de visibilidade por rede, com seletor de coaches (consulta `coaches` + `profiles.name`) e persistência dos dois campos novos.
- `src/components/store/PartnerProfessionalStore.tsx`: buscar os campos novos e filtrar os cards pelo `coach_id` do aluno logado.
- `src/routes/loja.tsx` e `src/routes/produto.$id.tsx`: repassar o coach da indicação (código já resolvido em `atribuicao.ts`) para as RPCs públicas e tratar o caso "indisponível".
- Selo "Restrito à rede" nos cards dos painéis de parceiro e profissional.

Após aplicar, configuro o produto do Adriano com a restrição ligada apontando para o coach dele.
