# Plano — Reorganização Herbalife + Espelho + Boleto

## Fase 1 ✅ Reorganização de seções
Migrada: "Suplementos" com Herbalife como categoria e subcategorias antigas.

## Fase 2 ✅ Espelho read-only
Colunas `is_mirrored` + `mirror_source_product_id` + trigger de sync + botões admin "Migrar/Remover Herbalife".

## Fase 3 ✅ Custo Herbalife
Já flui pelo `product_value_slots` do produto mestre (destino "painel de pedidos"). Como os espelhos apontam ao mestre via `mirror_source_product_id`, o custo é lançado pelo pipeline existente sem duplicação.

## Fase 4 ✅ Fluxo de boleto Herbalife
- Tabela `herbalife_boletos` + bucket privado `herbalife-boletos`.
- Server fns: `listMyHerbalifeSales`, `submitHerbalifeBoleto`, `adminListHerbalifeBoletos`, `adminConfirmHerbalifeBoleto`.
- UI Parceiro/Profissional: `/partner/herbalife-boletos`, `/professional/herbalife-boletos` — lista de vendas com anexo de boleto (arquivo ou código).
- UI Admin: `/admin/herbalife-boletos` — pendentes/pagos, confirma pagamento + anexa comprovante.
- Links de acesso nos dashboards de parceiro, profissional e admin.
