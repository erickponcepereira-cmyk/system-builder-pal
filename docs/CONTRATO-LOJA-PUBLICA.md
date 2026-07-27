# CONTRATO — Leitura pública da loja (Entrega 1)

> Escrito pelo chat de funcionalidades. **Nenhum SQL foi escrito aqui de
> propósito**: quem implementa é o chat financeiro, que tem acesso ao banco.
> Este documento define só a fronteira — o que entra, o que sai, e o que
> NUNCA pode sair.
>
> O front (`src/lib/public-store.ts`) já consome exatamente este formato,
> hoje com mock. Quando as RPCs existirem, troca-se uma função e a UI não muda.

## Por que RPC e não abrir RLS nas tabelas

A query atual do catálogo (`StorePage.tsx:163`) seleciona, direto no cliente:

```
cost, other_costs, app_fee, app_fee_percentage, card_fee_percentage,
credit_fee_percentage, tax_percentage, commission_coach,
commission_level1, commission_level2, commission_level3, creator_coach_id
```

Custo, margem e a tabela de comissões inteira. Hoje isso está atrás de
`_authenticated`. Se a leitura de `products` for aberta para o papel `anon`,
esses campos vazam para qualquer pessoa — o `anon key` é público, está no
bundle. Não existe "abrir só um pouco" com `SELECT *` no cliente.

Por isso: função `SECURITY DEFINER` que devolve uma lista fixa de colunas.
A allowlist fica no servidor, não na confiança do front.

**Precedente já existente no código:** `validate_referral_code` é chamada sem
sessão em `r.$code.tsx:31`. O padrão de RPC pública já funciona neste projeto.

## RPC 1 — `public_store_catalog`

```
public_store_catalog(_referral_code text default null)
  returns setof record
```

`_referral_code` = o `{code}` de `/r/{code}`. Quando presente, filtra para os
produtos daquele coach/parceiro. Quando nulo, devolve a vitrine FitMind geral
(mesmo filtro de audiência que a loja logada usa: `target_audiences` contendo
`fitmind`, ou vazio).

### Colunas devolvidas — lista fechada

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid | id da origem |
| `kind` | text | `challenge` \| `digital` \| `store` \| `item` \| `partner` |
| `title` | text | |
| `subtitle` | text | pode ser null |
| `short_description` | text | **truncado**, ver "detalhe ampliado" abaixo |
| `price` | numeric | preço de venda |
| `original_price` | numeric | preço riscado, pode ser null |
| `is_price_range` | bool | |
| `min_price` / `max_price` | numeric | só quando `is_price_range` |
| `badge_label` | text | selo de vitrine |
| `image_url` | text | capa única (não a galeria) |
| `section_id` | uuid | |
| `section_name` | text | |
| `in_stock` | bool | **booleano, não a quantidade** |

### Colunas PROIBIDAS nesta RPC

Nunca devolver, em nenhuma hipótese, nem "só para debug":

```
cost                     other_costs              app_fee
app_fee_percentage       card_fee_percentage      credit_fee_percentage
tax_percentage           commission_coach         commission_level1
commission_level2        commission_level3        creator_coach_id
points_per_sale          nutritionist_fee (legado morto)
stock (quantidade)       qualquer coluna de student_*/profiles
```

`stock` vira `in_stock boolean`. Quantidade exata é informação de operação.

### "Detalhe ampliado" — a regra de gate

O briefing manda: navegar é livre, **ver detalhe ampliado exige criar conta**.
A fronteira fica no servidor, não no front:

- `short_description`: primeiros ~180 caracteres. É o que a vitrine mostra.
- `description` completa, `image_urls` (galeria), ficha técnica, avaliações:
  **não saem por esta RPC.** Continuam vindo da leitura autenticada atual.

Assim o gate não é um `if` no React que se contorna com DevTools — o dado
simplesmente não trafega para quem não tem sessão.

### Regra de USO — não muda

Ver produto/benefício é público. **Usar** o benefício continua exigindo ter
comprado algo que o libere. Essa lógica é da área logada e não é tocada aqui.

## RPC 2 — `public_store_benefits`

```
public_store_benefits(_referral_code text default null)
  returns setof record
```

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid | |
| `name` | text | |
| `description` | text | |
| `category` | text | |
| `discount_info` | text | ex.: "20% OFF" — é chamariz, pode ser público |
| `website_url` | text | marketing, público |
| `has_coupon` | bool | **booleano** |

### Coluna PROIBIDA

```
coupon_code
```

O cupom **é** o uso do benefício. Hoje ele é carregado em
`student.benefits.tsx:57` para qualquer aluno logado. Expor sem sessão
entregaria o benefício de graça a quem nunca comprou — quebrando a regra que o
briefing manda preservar. Público vê que o benefício existe e quanto vale;
o código só na área logada, sob a regra de liberação atual.

## Requisitos de segurança da implementação

1. `SECURITY DEFINER` com `set search_path = public, pg_temp`.
2. `GRANT EXECUTE ... TO anon, authenticated`. Sem `GRANT` de tabela para `anon`.
3. Nenhuma policy nova de `SELECT` para `anon` em `products`, `store_products`,
   `digital_products`, `professional_products`, `partner_benefits`. O acesso
   público entra **só** pela RPC.
4. Filtros de status preservados: `status='active'`, `is_active=true`,
   e para `professional_products` também `approved` + `is_ready_for_sale`
   + `kind <> 'free'` (espelhando `StorePage.tsx:180-190`).
5. Função `STABLE`, não `VOLATILE` — é leitura.
