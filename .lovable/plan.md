## Objetivo

Permitir que profissionais anexem arquivos (ebooks, PDFs etc.) aos seus produtos pagos, liberados ao comprador após o pagamento — igual já existe hoje para produtos de parceiro.

## Situação atual (verificada)

- A tabela `product_downloads` só tem `product_id` (produtos FitMind) e `partner_product_id` (parceiros), com um CHECK que exige exatamente um dos dois.
- As políticas de acesso cobrem admin e parceiro; não há nada para profissional.
- O componente `ProductDownloadsManager` aceita apenas `productId` ou `partnerProductId`, e está usado só no painel de parceiro.
- O modal de produto do profissional (`ProfessionalProductsPanel`) não tem seção de arquivos.
- As compras de produtos de profissional já ficam em `partner_product_orders` com a coluna `professional_product_id`, então dá para validar a compra do mesmo jeito que o parceiro.

## Plano

1. **Banco (migração)**
   - Adicionar `professional_product_id` em `product_downloads` (FK para `professional_products`, ON DELETE CASCADE) + índice.
   - Trocar o CHECK para exigir exatamente uma das três origens.
   - Nova política: profissional gerencia (ver/criar/editar/excluir) os arquivos dos próprios produtos.
   - Política de Storage no bucket `product-downloads` para o profissional enviar/apagar arquivos sob o prefixo do próprio produto.

2. **Server functions (`src/lib/product-downloads.functions.ts`)**
   - `listProfessionalProductDownloads` (dono/admin, para o painel de edição).
   - Incluir arquivos de produtos de profissional na listagem do aluno, liberando somente quando existir pedido pago em `partner_product_orders` com aquele `professional_product_id`.
   - Estender a geração do link assinado de download para validar também a compra de produto de profissional.

3. **UI**
   - `ProductDownloadsManager`: aceitar `professionalProductId`, salvar na coluna correta e usar prefixo de caminho `prof/<id>/...`.
   - `ProfessionalProductsPanel`: mostrar a seção "Arquivos liberados após o pagamento" no modal de edição, apenas para produto já salvo e pago (mesma regra do parceiro), desabilitada em modo somente leitura (co-produtor).
   - `student.downloads.tsx`: exibir os arquivos vindos de produtos de profissional com o nome do produto.

## Detalhes técnicos

- Limite de 200MB por arquivo e upload múltiplo, iguais ao fluxo atual de parceiro.
- Verificação de compra sempre no servidor (service role), nunca só no cliente.
- Nenhuma mudança nas regras financeiras ou de comissão.
