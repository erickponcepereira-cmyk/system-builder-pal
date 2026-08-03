# Carrinho estilo marketplace na loja pública + cadastro direto de aluno

Hoje a loja pública só mostra o produto e manda a pessoa para `/register`, onde ela ainda precisa escolher o perfil (Aluno/Coach/Parceiro/Profissional). Isso mata conversão. A proposta segue o padrão de grandes marketplaces: navegar → adicionar ao carrinho → ver carrinho → "Finalizar compra" → cadastro rápido (Google em destaque) → volta para o carrinho intacto e paga.

## Etapa 1 — Carrinho público e cadastro sem fricção

**Carrinho para visitante**
- Novo carrinho na loja pública com os mesmos gestos do app logado: botão "Adicionar ao carrinho" no card e no modal do produto, badge com contador no topo, painel lateral do carrinho com itens, quantidade, remover e subtotal.
- Persistência local (sobrevive a fechar o navegador, ao redirect do Google e ao cadastro).
- Produtos agendáveis entram no carrinho escolhendo dia/horário na hora de adicionar; o horário fica marcado como "a confirmar no pagamento" (sem reserva firme, para não travar agenda de terceiros) e é revalidado no checkout — se tiver sido tomado, o item aparece destacado pedindo novo horário.
- O coach indicador do link continua colado ao carrinho (regra de primeiro toque já existente).

**Cadastro direto de aluno**
- "Finalizar compra" leva para `/register?role=student` já com o formulário de aluno aberto — sem a tela de escolha de perfil.
- Topo do formulário com o bloco Google em destaque ("Mais rápido: entre com o Google em 1 toque"), e o cadastro por e-mail como alternativa secundária abaixo.
- O coach indicador aparece bloqueado/confirmado no formulário ("Você foi indicado por X"), como já acontece hoje.
- Resumo do carrinho visível ao lado/acima do formulário ("Seu carrinho: 2 itens · R$ X") para sustentar a intenção de compra.
- Depois do cadastro (Google, e-mail ou "completar cadastro"), a pessoa cai direto na loja do aluno com o carrinho migrado e aberto no checkout — sem passar pelo seletor de painel.

**Carrinho compartilhado entre as duas lojas**
- O carrinho do visitante é migrado para o carrinho do aluno logado no primeiro acesso após o login, mesclando com o que já houver lá.

## Etapa 2 — Pagamento único de todos os itens

Hoje o carrinho logado já paga junto os itens FitMind (planos, cursos, produtos da loja), mas cada produto de parceiro e de profissional vira um pedido e um pagamento separado — é assim que as comissões, splits e co-produções são calculadas.

Para chegar em "um pagamento só" sem quebrar nada disso:
- Criar um agrupador de pedidos: o checkout continua gerando cada pedido individual (mantendo splits, comissões, co-produção, estoque e agenda exatamente como hoje), mas todos ficam ligados a um mesmo grupo de pagamento.
- O Mercado Pago recebe **uma única cobrança** com o total do grupo; ao confirmar, o webhook marca todos os pedidos do grupo como pagos de uma vez.
- Pagamento por carteira segue a mesma lógica: um débito único do total do grupo.
- Falha parcial não existe — ou o grupo inteiro é aprovado, ou nenhum pedido é liberado.
- Tela de sucesso única listando tudo que foi comprado (tickets, carteirinha, agendamentos, downloads).

### Detalhes técnicos

- `src/routes/loja.tsx`, `src/components/store/public/PublicProductModal.tsx`, `src/routes/produto.$id.tsx`: botões de carrinho e painel do carrinho público.
- Novo `src/lib/public-cart.ts`: itens do carrinho anônimo em `localStorage` (id, tipo, quantidade, horário escolhido, preço de vitrine), com validação contra o catálogo público no checkout — preço final sempre recalculado no servidor.
- `src/lib/post-auth-intent.ts`: nova intenção `/student/store?checkout=1` para abrir o checkout logo após o cadastro.
- `src/routes/register.tsx`: quando houver carrinho pendente, forçar `role=student` e exibir o resumo do carrinho; `GoogleSignupTop` ganha destaque visual de caminho recomendado.
- `src/components/student/StorePage.tsx`: importar o carrinho público na montagem (merge por id), abrir o carrinho quando `checkout=1`.
- Etapa 2: nova tabela de grupo de pagamento (`order_payment_groups` + coluna de grupo nos pedidos), ajuste em `create_store_order`/`create_partner_product_order`/`create_scheduled_professional_order` para aceitar o grupo, e no webhook do Mercado Pago (`api.public.mp.webhook.ts` / `mp-sweep.server.ts`) para liquidar o grupo inteiro. Nenhuma regra de comissão, split ou co-produção é alterada.

## Ordem de entrega

1. Etapa 1 completa (carrinho público + cadastro direto + migração do carrinho) — é o que mais mexe em conversão.
2. Etapa 2 (pagamento único agrupado) em seguida, já com o carrinho em produção e testado.
