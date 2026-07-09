# Plano — Reorganização Herbalife + Espelho read-only + Boleto

## Fase 1 — Reorganização de seções (ESTA FASE)
- Criar seção "Suplementos" (target_audience = fitmind e outra para partner/professional respectivamente, ou usar `target_audiences` array).
- Transformar seções "Herbalife" e "Herbalife (Parceiros)" em categorias dentro de "Suplementos".
- Categorias existentes (Chás Funcionais, Nutrição Esportiva 24h, Proteínas Funcionais, Se Torne Cliente Premium, Se Torne Consultor Herbalife, Nutrição Externa) viram subcategorias dentro da nova categoria "Herbalife".
- Reapontar `products.section_id/category_id/subcategory_id`, `partner_products.*`, `professional_products.*` das linhas afetadas para a nova estrutura.
- Manter seções antigas com `is_active=false` como legado (não deletar) até validar.

## Fase 2 — Espelho read-only Herbalife → parceiro/profissional
- Adicionar colunas em `partner_products` e `professional_products`:
  - `mirror_source_product_id uuid REFERENCES public.products(id)`
  - `is_mirrored boolean` (true = read-only, herdado)
- View / lógica: quando exibir catálogo do parceiro/profissional, incluir também os espelhos.
- UI de edição: se `is_mirrored`, campos travados (preço, foto, descrição, cost). Só pode ativar/desativar exibição.
- Botão admin "Migrar catálogo Herbalife para parceiro X" cria os registros espelho em lote.

## Fase 3 — Custo Herbalife no painel de pedidos
- Ao registrar venda de produto Herbalife via parceiro/profissional, chamar `orderpool.functions.ts` para inserir entry em `product_order_pool_entries` com o `cost` do produto original.
- Recalcular repasses: subtrair o custo antes do partner_net_amount / professional_net_amount.
- Refletir no ProductFinancialEditor / painel financeiro existente.

## Fase 4 — Fluxo de boleto Herbalife
- Nova tabela `herbalife_boletos`:
  - order_id (fk partner_product_orders ou store_orders), boleto_file_url, boleto_barcode, submitted_at, submitted_by, admin_paid_at, admin_paid_by, payment_proof_url, status ('pending_admin_payment'|'paid').
- UI parceiro/profissional: aba "Vendas Herbalife" (nome cliente, produtos, data, forma pgto, prazo, endereço, botão anexar boleto/código).
- UI admin em `admin.product-orders`: painel de boletos pendentes com botão "Confirmar pagamento" + upload comprovante.
- Notificação parceiro quando admin confirma pagamento.

---

## Iniciando Fase 1 agora.
