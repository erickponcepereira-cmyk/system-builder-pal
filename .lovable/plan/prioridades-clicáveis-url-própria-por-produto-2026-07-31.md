# Prioridades clicáveis + URL própria por produto

## 1. Card de Prioridades leva para a Base de Alunos filtrada

Hoje o bloco "Prioridades · Alertas" (visão geral do coach) é apenas informativo.

- O alerta "X alunos há mais de 7 dias sem avaliação" passa a ser clicável e abre a aba **Base de Alunos** já com o filtro **"Sem bioimpedância"** ativo (esse filtro já existe na aba).
- O alerta "novos alunos nas últimas 48h" também vira clicável e abre a Base de Alunos com a ordenação por mais recentes.
- Cursor de mão, foco por teclado e aparência de item clicável.

Técnico: `CoachAlertsCard` ganha uma prop opcional `onNavigate(tab, sort)`; `coach.tsx` passa uma função que troca `activeTab` para `students` e guarda o `sort` inicial; `CoachStudentsTab` aceita `initialSort` (`no_bioimpedance`). O card também é usado dentro da própria aba de alunos — lá ele só aplica o filtro, sem trocar de aba.

## 2. Cada produto com URL própria (loja pública e privada)

Problema atual: o botão Compartilhar gera `/r/{codigo}?p={id}` para quase tudo, e esse link:
- quando a pessoa já está logada como aluno, cai em `/student/store` e o produto se perde;
- para produtos de parceiro/profissional cai em `/loja?produto=…`, que é a vitrine, não o produto.

A rota `/produto/{id}` já existe e já resolve produtos FitMind, de parceiro e de profissional (via `fetchPublicProduct`). Só não está sendo usada como link padrão.

Mudanças:

- **Um único formato de link em todo o sistema**: `https://fitmindclub.com.br/produto/{id}?ref={codigo}`. Passa a valer para:
  - loja do coach (`StoreTab` / `PartnerProfessionalStore`),
  - loja do aluno (`StorePage`, todos os tipos — não só `challenge`/`item`),
  - modal de indicação do aluno (`StudentReferralModal`),
  - helper central `shareReferralProduct` e `linkProduto`.
- **`/produto/{id}` passa a ler `?ref=`** e gravar a atribuição do indicador (mesmo armazenamento usado por `/r/{code}`), para que a comissão continue sendo do coach depois de cadastro/login.
- **`/r/{code}?p={id}` continua funcionando** (links já enviados), mas passa a redirecionar sempre para `/produto/{id}`, inclusive quando o usuário já está logado — hoje ele ignora o produto e joga na loja.
- **Loja privada com deep link**: `/student/store?produto={id}` abre o produto direto; e ao abrir um produto na loja o endereço passa a refletir o produto, para que copiar a URL da barra já funcione.
- Botão "Ver no app / continuar" dentro de `/produto/{id}` leva para a loja logada com o mesmo produto aberto.

## Fora do escopo

- Sem mudanças em preços, comissões, estoque ou checkout.
- Sem alteração de banco de dados.
