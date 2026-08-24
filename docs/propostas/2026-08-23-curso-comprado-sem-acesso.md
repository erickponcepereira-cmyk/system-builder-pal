# Curso comprado pode não liberar acesso

23/08/2026. **Achado, não correção.** Precisa de uma verificação que só quem
tem acesso de escrita ao banco consegue fazer.

## O que eu vi

O carrinho manda cursos assim:

```ts
// UnifiedStorePage → store-checkout.ts, e igual na loja atual
{ kind: "digital", sourceId: <digital_products.id>, quantity: 1 }
```

A versão mais recente de `create_store_order` **no repositório**
(`supabase/migrations/20260605071335_8fa6ab8a-2ee8-4572-acf7-33a251610f22.sql`)
resolve todo item pela tabela `products`:

```sql
-- linha 86
FROM public.products WHERE id = source_id;
-- linha 89
RAISE EXCEPTION 'Produto % não encontrado', source_id;
```

`digital_products.id` não existe em `public.products`. Pela leitura do
repositório, comprar um curso pelo carrinho **falha na criação do pedido**.

E mesmo que o pedido nascesse: a transação sai com `purchase_type='store_order'`,
enquanto o único caminho que insere em `digital_purchases` exige
`purchase_type='digital'`. Sem linha em `digital_purchases`,
`can_view_digital_product` devolve falso, a RLS esconde os módulos e o curso
**não aparece em "Meus cursos"** — a pessoa paga e não recebe.

## Por que não corrigi

**Não consigo ler o corpo da função que está rodando em produção.** O
repositório e o banco divergem — é o mesmo vaivém que causou o incidente dos
gratuitos, onde a permissão que quebrou a tela não existia em migration
nenhuma.

Um indício de que alguém já pensou nisto: a coluna
`store_order_items.digital_product_id` **existe em produção** (confirmei pela
API REST) e **nenhuma linha do repositório a escreve**. Ou seja: ou a função
viva já foi corrigida direto no banco, ou a coluna foi criada e o trabalho
parou no meio.

Escrever a migration sem saber qual dos dois é o caso pode desfazer uma
correção que já está de pé.

## Como verificar, em um minuto

No SQL editor do Supabase:

```sql
select prosrc from pg_proc where proname = 'create_store_order';
```

Procure no corpo devolvido por `digital_products`. Se **não** aparecer, o bug é
real e vale a correção abaixo. Se aparecer, o repositório é que está velho — e
aí o que falta é trazer a função viva para uma migration, para não perdê-la de
novo.

## A correção, se for necessária

Duas pontas, e as duas precisam existir:

**1. `create_store_order` aceitar `kind = 'digital'`** — resolver o item em
`digital_products` em vez de `products`, e gravar
`store_order_items.digital_product_id` (a coluna já está lá).

**2. `mark_store_order_paid_and_process`** (em
`supabase/migrations/20260610211241_da305da8-5104-4a66-a13c-ceb6151e0ed5.sql`)
percorrer os itens com `digital_product_id` preenchido e inserir em
`digital_purchases`:

```sql
insert into public.digital_purchases
  (student_id, digital_product_id, amount_paid, expires_at)
select o.student_id,
       i.digital_product_id,
       i.total_price,
       case when dp.access_days is null then null
            else now() + (dp.access_days || ' days')::interval end
  from public.store_order_items i
  join public.store_orders o       on o.id = i.order_id
  join public.digital_products dp  on dp.id = i.digital_product_id
 where i.order_id = _order_id
   and i.digital_product_id is not null
on conflict do nothing;
```

`on conflict do nothing` porque reprocessar pagamento é coisa que acontece — e
liberar duas vezes o mesmo curso não deve virar duas linhas.

## Como testar depois

Comprar um curso de valor baixo com uma conta de aluno de verdade e conferir,
nesta ordem:

1. o pedido foi criado (`store_orders`);
2. o item tem `digital_product_id` preenchido (`store_order_items`);
3. existe linha em `digital_purchases`;
4. o curso aparece em `/student/library`.

O passo 4 é o único que o comprador enxerga. Os três primeiros são onde a
falha se esconde.
