# Corrigir erro ao salvar produto (recurrence_interval)

## Causa confirmada

Na correção de "tudo vira assinatura", a normalização passou a gravar o campo de intervalo de recorrência como **vazio** quando o produto não é assinatura. Mas nas quatro tabelas de produto (parceiro, profissional, loja e produtos FitMind) esse campo é **obrigatório** no banco (padrão "monthly"). Resultado: qualquer produto avulso falha ao salvar com a mensagem do print.

## Correção

- Na normalização compartilhada de recorrência: quando o produto não for assinatura, gravar `is_recurring = false` e manter o intervalo como `"monthly"` (valor neutro, ignorado quando não há assinatura), em vez de vazio. O restante continua limpo: valor de recorrência zerado, trial 0, venda avulsa liberada.
- Ajustar o mesmo ponto no gerenciador de itens da loja do admin, que também envia vazio nesse campo.

Nenhuma mudança de esquema, preço, comissão ou de quem vê o produto. Produtos avulsos continuam avulsos — o que define assinatura é o marcador `is_recurring`, não o intervalo.

## Validação

Criar/salvar um produto pago sem marcar assinatura no painel de parceiro, no de profissional e na loja do admin, e conferir que salva sem erro e continua aparecendo como compra única no checkout.
