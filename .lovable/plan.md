## Bug: erro ao vender "Experience Day"

**Causa:** Existem duas versões da função `create_partner_product_order` no banco:
- `create_partner_product_order(uuid, text, uuid)` — versão antiga
- `create_partner_product_order(uuid, text, uuid, uuid)` — versão nova com `_referred_by_student_id`

Quando o frontend chama a função passando apenas 3 argumentos nomeados (`_professional_product_id`, `_payment_method`, `_buyer_student_id`), o PostgreSQL não consegue decidir qual sobrecarga usar porque o quarto parâmetro da versão nova tem DEFAULT, tornando ambas candidatas válidas. Resultado: erro `Could not choose the best candidate function between...`.

## Correção

Migration única: `DROP FUNCTION public.create_partner_product_order(uuid, text, uuid);` — remove a assinatura antiga de 3 argumentos, mantendo apenas a nova (4 argumentos, com `_referred_by_student_id` opcional).

Isso resolve a ambiguidade sem alterar código do frontend e mantém compatibilidade com chamadas de 3 ou 4 argumentos (via default).
