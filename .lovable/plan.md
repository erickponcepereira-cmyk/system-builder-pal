## Problema

A loja pública (`/loja`) hoje usa um layout próprio, com 4 abas soltas (Produtos, Parceiros, Profissionais, Benefícios) e chips de filtro. A loja logada (`StorePage`) usa outro modelo: 2 abas (FitMind / Parceiros & Profissionais) e navegação por cards de Seção → Categoria → Subcategoria. Resultado: quem vê a vitrine pública tem uma experiência diferente e confusa.

## Objetivo

Duplicar o layout da loja logada na loja pública, mantendo:
- sem carrinho e sem checkout (compra exige conta);
- sem vazamento de dados (nada de custo, taxa, comissão, margem, estoque exato, cupom, telefone/email de parceiro).

## O que muda

**1. `/loja` passa a espelhar o layout da loja logada**
- Cabeçalho igual (título "Loja" + nome do indicador quando houver), busca no mesmo lugar.
- Duas abas apenas: **FitMind** e **Parceiros & Profissionais** — acaba a separação em abas distintas de parceiro e profissional.
- Aba FitMind: grade de cards de **Seções** (com imagem e proporção configurada no admin) → ao entrar, cards de **Categorias** → **Subcategorias** → lista de produtos, com a mesma trilha de navegação ("← Loja / Seção / Categoria").
- Aba Parceiros & Profissionais: mesma vitrine unificada agrupada por vendedor, no mesmo formato visual da versão logada.
- Benefícios deixa de ser aba de topo e vira uma seção dentro da vitrine (ou é removido da navegação principal) — mantendo o card sem exibir o código do cupom.

**2. Ações de compra viram CTA de conta**
- Botão "Adicionar" é substituído por "Ver detalhes / Criar conta para comprar".
- Ícone e drawer de carrinho saem da loja pública.
- Modal de detalhe público: foto, título, descrição curta, preço e o CTA de cadastro — sem ficha completa, sem contato do vendedor.
- O contexto de indicação (`/r/{código}?to=loja`) continua preservado até o cadastro.

**3. Camada de dados pública**
- `src/lib/public-store.ts` ganha subcategorias e imagens/dimensões de seção e categoria na taxonomia, além do nome do vendedor (parceiro/profissional) para o agrupamento.
- Continua valendo a regra de colunas proibidas já documentada no arquivo: nenhum campo financeiro ou de contato trafega para a rota pública.
- Se a leitura anônima de alguma dessas tabelas de taxonomia não estiver liberada, entra uma migração com política de leitura pública **somente** para colunas de vitrine.

## Detalhes técnicos

- A `StorePage` (1675 linhas, acoplada a sessão, carteira e comissões) **não** será reutilizada nem alterada — o risco de vazar campo sensível ou quebrar a área logada é alto. O layout será extraído em componentes de apresentação puros usados pela rota pública.
- Novos componentes de apresentação em `src/components/store/public/` (grade de seções, grade de produtos, modal de detalhe público), consumindo só os tipos de `public-store.ts`.
- `src/routes/loja.tsx` é reescrita para orquestrar abas, drill-down, busca e o CTA de cadastro.
- Como a rota é pública com SSR, leitura de storage e da querystring continua acontecendo só após montar, para não quebrar hidratação.

## Fora de escopo agora

Melhorias visuais além da paridade com a loja logada — como você disse, primeiro duplicar, depois melhorar.
