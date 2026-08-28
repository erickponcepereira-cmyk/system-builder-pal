# Loja nova: produtos de parceiro e profissional sumiram

## O que está acontecendo (confirmado)

O "Desafio Carol Aventureira" existe, está aprovado, ativo, pronto para venda e **não** tem restrição de rede — ou seja, deveria aparecer. Ele não some por filtro de cidade nem por busca: a loja **nunca recebe** esses produtos.

Causa confirmada: a correção de segurança tirou a permissão de leitura direta das tabelas de `parceiros`, `coaches` e `perfis` para usuários logados. As duas consultas da loja nova ainda pedem esses dados **junto** com o produto:

- produtos de parceiro pedem `partners(fantasy_name, city, upline_coach_id)`
- produtos de profissional pedem `coaches(profiles(name))`

Como o banco recusa a parte do vendedor, **a consulta inteira falha** — e com ela some todo o catálogo de parceiros e de profissionais de uma vez. É exatamente o "sumiu um monte de outros produtos". O catálogo FitMind continua aparecendo porque não depende dessas tabelas.

## Correção

1. Separar a leitura do produto da leitura do vendedor. As consultas de `partner_products` e `professional_products` passam a trazer só as colunas do próprio produto (sem os dados aninhados do vendedor).
2. Buscar o nome/cidade do vendedor por caminho autorizado, em uma chamada só:
   - parceiros: reutilizar `parceiros_publicos(_ids)`, que já existe e já é usado em outra tela;
   - profissionais: criar uma função equivalente que devolve apenas `coach_id` e nome público do profissional (nada de e-mail, telefone, documento).
3. Se a busca de vendedores falhar, o produto continua na vitrine com o nome do vendedor vazio — falha aberta. Perder o nome é aceitável; perder o produto não.
4. Passar a **sinalizar erro visível** nessas consultas: hoje um erro só vira `console.error` e a loja parece apenas "vazia". Com o aviso de catálogo incompleto, uma falha dessas não passa mais semanas sem ser notada.

## Verificação depois da correção

- "Desafio Carol Aventureira - Outubro Rosa" e "Desafio Carol Aventureira & FitMind - Outubro Rosa" aparecem na loja, na busca por "carol" e por "desafio".
- Contagem de produtos de parceiro e de profissional na vitrine maior que zero, em Cuiabá, em Várzea Grande e em "todas as cidades".
- Nenhum dado sensível de parceiro/profissional volta ao cliente.

## Detalhes técnicos

- `src/lib/unified-store.ts`: remover os embeds `partners(...)` e `coaches!professional_products_coach_id_fkey(profile:profiles(name))`; após o `Promise.all`, resolver vendedores por RPC em lote e preencher `sellerName`, `sellerCity`, `sellerCoachId`.
- Nova função `public.profissionais_publicos(_ids uuid[])` (security definer, `search_path=public`, `GRANT EXECUTE` para `authenticated`/`anon`), devolvendo `coach_id`, `nome`, `cidade`.
- `src/components/store/UnifiedStorePage.tsx`: exibir o aviso de "catálogo incompleto" quando `catalog.errors` não estiver vazio.
- Sem mudança nos grants das tabelas: as tabelas sensíveis continuam fechadas.
