# Correção da loja nova

Quatro problemas relatados, com o que foi verificado no banco e no código.

## 1. Produto duplicado (confirmado)

A loja lê a tabela de produtos FitMind **duas vezes**: uma pelo modelo antigo (status ativo) e outra pelo modelo novo (com seção/categoria). Hoje as duas leituras devolvem exatamente os mesmos 80 produtos, então todo produto FitMind aparece duas vezes na vitrine.

Correção: ler uma vez só. A linha do modelo novo (que traz seção, categoria, imagens e público-alvo) vira a fonte; o modelo antigo só entra para produtos que ainda não migraram, com deduplicação por id.

## 2. "Team Dunamis" e outros produtos que somem (causa confirmada)

O produto existe e está aprovado, ativo e pronto para venda. Ele some por duas regras que agem em silêncio:

- **Restrição de rede**: o produto está marcado como restrito às redes de dois coaches. Quem não está nessas redes não vê — inclusive o admin. Correção: admin (e o próprio parceiro dono) passam a enxergar o produto, com um selo "restrito à rede" para ficar claro por que ele não aparece para todo mundo.
- **Filtro de cidade automático**: ao abrir a loja, a cidade do perfil é selecionada sozinha. O parceiro é de Cuiabá; quem tem outra cidade no cadastro perde todos os produtos dele sem nenhum aviso. Correção: a loja abre em "todas as cidades", com a cidade do usuário destacada como atalho, e quando um filtro de cidade está ativo aparece um aviso com "ver de todas as cidades".

Também some sem explicação quando um filtro de faixa de preço/origem está ligado; o estado vazio passa a dizer qual filtro está cortando e oferecer limpar.

## 3. Busca que não encontra nada

Hoje a busca exige que **todos** os termos apareçam inteiros no texto do produto, e o índice de busca só tem título, nome do vendedor e descrição.

Nova busca, no formato de marketplace:

- casamento por **prefixo** ("dunam" acha "Dunamis", "prote" acha "proteína")
- índice ampliado: nome, vendedor, descrição, **seção, categoria, tipo do produto e cidade do vendedor**
- tolerância a erro de digitação de 1 letra em palavras com 5+ caracteres ("dunamys" → "dunamis")
- resultado **ordenado por relevância** (título > vendedor > categoria), não pela ordem do catálogo
- sugestões enquanto digita (produtos, categorias e vendedores), com busca por seção/categoria em um toque
- termo sem resultado dentro da seção atual passa a buscar na loja inteira, avisando disso

## 4. Tudo misturado (pagos, gratuitos, cupons)

Hoje benefício gratuito e produto pago dividem a mesma grade. Passa a haver separação clara na navegação:

- abas no topo: **Tudo · Comprar · Gratuitos**
- os gratuitos ganham faixa própria ("Benefícios gratuitos da sua carteirinha") em vez de se misturarem à grade de venda
- card de gratuito com selo verde e ação "Resgatar", nunca "Comprar"
- benefícios que dependem de carteirinha ativa aparecem marcados como tal, em vez de sumirem

## Detalhes técnicos

- `src/lib/unified-store.ts`: unificar as duas leituras de `products` com deduplicação por `sourceId`; ampliar o `haystack` com seção, categoria, tipo e cidade; trocar `matchesQuery` por busca com prefixo, distância de 1 e pontuação (`scoreQuery`).
- `src/lib/store-visibility.ts`: liberar produto restrito para admin e para o dono (parceiro/profissional criador), mantendo o bloqueio para o resto.
- `src/lib/store-filters.ts`: motivo do estado vazio (qual filtro cortou) e separação por tipo (pago/gratuito).
- `src/components/store/UnifiedStorePage.tsx`: abas Tudo/Comprar/Gratuitos, faixa de gratuitos, sugestões de busca, aviso de cidade filtrada, estado vazio com ação, e não pré-selecionar cidade na carga.
- Sem mudança de banco: as causas verificadas são de consulta e de filtro no cliente.
