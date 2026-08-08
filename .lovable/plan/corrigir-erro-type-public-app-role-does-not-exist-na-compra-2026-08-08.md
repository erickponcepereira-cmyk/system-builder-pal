# Corrigir erro "type public.app_role does not exist" na compra

## Diagnóstico (confirmado no banco)

O produto "Condomínio Chapada do Poente" é um produto restrito à rede. Ao finalizar a compra, o gatilho `enforce_product_network_restriction` roda e chama:

```text
public.has_role(auth.uid(), 'admin'::public.app_role)
```

Verificado no banco: **não existe** a função `has_role` nem o tipo `app_role` neste projeto. O controle de admin aqui é feito por `public.is_admin(uuid)` (lê `profiles.role = 'admin'`). Por isso o Postgres aborta a compra com a mensagem exibida no print.

A mesma chamada inexistente aparece também em `backfill_career_points()` (ferramenta administrativa), que hoje falharia pelo mesmo motivo.

## Correção

Uma migração única que recria as duas funções trocando a checagem de admin:

- `enforce_product_network_restriction()` — usar `public.is_admin(auth.uid())` no lugar de `public.has_role(auth.uid(), 'admin'::public.app_role)`. Nenhuma outra regra muda: continua liberando dono do produto, coaches autorizados e toda a rede abaixo deles, e bloqueando os demais.
- `backfill_career_points()` — mesma troca na verificação de permissão.

Sem mudança de esquema, de RLS, de preço ou de comissão.

## Validação

Depois de aplicada, testar a compra do produto do condomínio (PIX) com um aluno da rede autorizada e confirmar que o pedido é criado sem o erro.
