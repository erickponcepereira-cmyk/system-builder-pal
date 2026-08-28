# Desafio Carol: por que ainda não aparece (causa confirmada)

## O que foi verificado agora

Os dois produtos existem, estão aprovados, ativos, prontos para venda e sem restrição de rede:

- "Desafio Carol Aventureira - Outubro Rosa" (R$ 50)
- "Desafio Carol Aventureira & FitMind - Outubro Rosa" (R$ 150)

A função de vendedor criada na correção anterior funciona: devolve "Carol Heming · Cuiabá". As permissões e as regras de acesso também estão certas. Ou seja, a correção anterior resolveu **um** problema real, mas não o que faz o produto sumir.

## A causa real: o banco corta o catálogo em 1000 itens

Hoje existem **1579** produtos de profissionais aprovados e à venda. A leitura da loja pede todos de uma vez, mas o servidor devolve no máximo **1000 linhas por consulta** — e ignora o pedido de 5000 que está no código.

Na ordem usada hoje, os produtos da Carol estão nas posições **1566 e 1579**. Eles ficam exatamente fora do corte. Não é filtro, não é busca, não é cidade: a loja **nunca recebe** esses 579 produtos, em nenhuma aba, em nenhuma cidade.

É também o motivo do "sumiu um monte de outros produtos": são 579 produtos de profissionais invisíveis ao mesmo tempo.

(As outras fontes estão abaixo do limite: 246 de parceiros, 81 FitMind, 1 curso — por isso só o catálogo de profissionais foi afetado.)

## Correção

1. Ler os produtos de profissionais (e de parceiros, por segurança futura) **em páginas de 1000**, até acabar o catálogo, em vez de uma consulta só. As páginas seguintes são pedidas em paralelo, então não há perda perceptível de velocidade.
2. Usar uma ordenação **estável** (`sort_order` e depois `id`). Hoje quase todos têm o mesmo `sort_order`, e sem desempate o banco pode devolver a mesma linha em duas páginas e omitir outra — o que reintroduziria o mesmo sumiço de forma aleatória.
3. Comparar o total recebido com o total informado pelo banco e, se faltar item, registrar o aviso de "catálogo incompleto" que já existe na tela — para que um corte silencioso nunca mais passe despercebido.

## Verificação antes de devolver

Só devolvo depois de confirmar, com a loja aberta:

- os dois "Desafio Carol Aventureira" aparecem na vitrine;
- aparecem na busca por "carol" e por "desafio";
- aparecem em Cuiabá e em "todas as cidades";
- o número de produtos de profissionais na vitrine bate com os 1579 do banco (descontando o que a rede/curadoria esconde de propósito).

Depois disso, faço a mesma conferência para as demais fontes do catálogo.

## Detalhes técnicos

- `src/lib/unified-store.ts`: substituir as consultas únicas de `professional_products` e `partner_products` por um utilitário de paginação (`.range(offset, offset+999)` em laço/paralelo), com `.order("sort_order").order("id")`; primeira página com `count: "exact"` para saber quantas páginas pedir e para detectar truncamento.
- Sem mudança no banco: a causa é de leitura no cliente, e o limite de 1000 é do servidor de dados.
