## Problema
No card do produto grátis, o botão "Reservar horário" só aparece quando `partner_products.uses_scheduling = true`. Verifiquei no banco: vários produtos que têm horários cadastrados em `partner_product_schedules` estão com `uses_scheduling = false` (ex.: "Move Bike Indoor" tem 10 horários, mas a flag está false). Como o botão cai no `else`, o fluxo dispara direto o resgate/QR sem passar pelo seletor de dia e horário.

Causa: a flag `uses_scheduling` só é atualizada quando o parceiro salva os horários via `set_partner_product_schedules`. Qualquer edição posterior do produto (form) sobrescreve o registro sem recalcular a flag, deixando ela dessincronizada dos horários reais.

## Correção

1. **Backfill** — recalcular `uses_scheduling` em `partner_products` a partir de `partner_product_schedules` para todos os produtos existentes (true quando houver pelo menos 1 horário).

2. **Trigger de sincronização** em `partner_product_schedules` (AFTER INSERT/UPDATE/DELETE) que atualiza `partner_products.uses_scheduling` com base na existência de horários. Assim a flag nunca mais fica desalinhada, independentemente de como o produto for editado.

3. Sem mudanças de UI: com a flag correta, o `PartnerFreebieBookingModal` (seletor de calendário + horários) volta a abrir normalmente para os produtos afetados.

## Detalhes técnicos

- Migração única com:
  - `UPDATE partner_products SET uses_scheduling = EXISTS(SELECT 1 FROM partner_product_schedules s WHERE s.partner_product_id = partner_products.id);`
  - Função `sync_partner_product_uses_scheduling()` + trigger em `partner_product_schedules` para INSERT/UPDATE/DELETE.
- Não altera RLS, grants, nem lógica do RPC existente.