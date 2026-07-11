## Problema

Ao finalizar compra de produto de parceiro/profissional na loja unificada, o backend retorna:

`column s.upline_coach_id does not exist`

## Causa raiz

A migração `20260709171301` recriou a função `create_partner_company_order(uuid, uuid, text, uuid)` (chamada quando a loja envia o parâmetro `_referred_by_student_id`) e usou por engano `s.upline_coach_id` para ler o coach titular do aluno. A tabela `public.students` nunca teve essa coluna — o campo correto é `s.coach_id` (as demais funções irmãs como `create_partner_product_order`, `create_scheduled_professional_order` e a overload de 3 argumentos usam `s.coach_id` corretamente).

Como toda compra de parceiro pela loja unificada agora passa por essa overload de 4 argumentos, o checkout inteiro quebra antes mesmo de criar o pedido.

## Correção

Uma única migração que faz `CREATE OR REPLACE FUNCTION public.create_partner_company_order(uuid, uuid, text, uuid)` mantendo toda a lógica atual (fees, comissões, upline, master cross bonus, fitcoin, insert do pedido, log de status) e trocando as duas ocorrências de `s.upline_coach_id` por `s.coach_id` nas linhas 31 e 33 do corpo da função. Nenhuma outra função é alterada; nenhuma alteração de schema; grants preservados.

Após aplicar a migração, o fluxo de checkout de produto de parceiro/profissional volta a funcionar sem tocar em nada do frontend.
