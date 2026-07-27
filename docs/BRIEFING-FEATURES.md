# BRIEFING — Chat de Funcionalidades

## Seu escopo
Duas entregas. Nada além delas sem falar com o usuário.

### Entrega 1 — Loja pública sem cadastro obrigatório
Modelo Mercado Livre / Amazon: navega livre, cadastra só na hora de comprar.

- Abas de loja acessíveis SEM login
- Benefícios gratuitos visíveis SEM login
- Para ver detalhes ampliados → exige criar conta
- Para USAR o benefício → mantém a regra atual (precisa ter comprado
  algo que libere aquilo). Essa regra NÃO muda
- Carrinho preservado em cache durante o cadastro: a pessoa monta o
  carrinho deslogada, cadastra, e o carrinho continua lá
- Loja vinculada ao coach: link do coach abre a loja dele, com os
  produtos dele. JÁ EXISTE o mecanismo `/r/{referral_code}` — construa
  em cima dele, não invente outro

Hoje tudo vive atrás de `_authenticated`. Isso significa mexer em rotas,
em RLS e em renderização. RLS é a parte perigosa: abrir leitura pública
de produto NÃO PODE vazar dado de aluno, preço de custo, ou margem.

### Entrega 2 — Cobrança recorrente via Mercado Pago
- Cartão salvo com débito automático mensal
- Continuar aceitando PIX, cartão de crédito e as formas atuais
- Serve para: mensalidade, anuidade e produtos de associações
  (existe um exemplo criado para sindicato)

Existe uma tabela `saved_payment_cards` com ZERO referências no código.
Verifique antes de criar outra. Dados de cartão têm implicação de LGPD e
PCI: NUNCA armazene número de cartão — só o token do Mercado Pago.

## NÃO É seu escopo
- Qualquer arquivo em `supabase/migrations/` — PROIBIDO
  (só o chat financeiro escreve migration; peça a ele)
- Carteiras, comissões, motor de distribuição
- Empacotamento mobile, Capacitor, APK

## Ambiente
- Repo: `C:\dev\fitmind-bugs` — branch `feat/bugs`
  (se a pasta não existir: `git clone https://github.com/erickponcepereira-cmyk/system-builder-pal.git fitmind-bugs`)
- Windows. Node v24.17.0, bun 1.3.14. O projeto usa **bun**, não npm
- Stack: TanStack Start + Vite + React + Supabase (dentro do Lovable Cloud)
- Pagamento: Mercado Pago. Webhook em `src/routes/api.public.mp.webhook.ts`
  — ele está BEM FEITO (refaz busca na API do MP, valida valor, idempotente).
  Use-o como referência de qualidade; não o quebre

## Contexto que evita retrabalho
- 163 tabelas, 107 usuários cadastrados, 428 migrations
- RLS habilitado em 163/163 tabelas
- Motor de distribuição: `product_value_slots` + `payment_fee_configs`.
  A coluna `products.nutritionist_fee` é LEGADO MORTO — não use
- Existem DOIS sistemas de assinatura vivos ao mesmo tempo:
  `subscriptions` e `user_subscriptions`. Antes de criar recorrência,
  descubra qual é o vivo. Não crie um terceiro
- 49 pedidos em `pending` somando R$ 31.430 (carrinhos abandonados).
  A loja pública tende a aumentar isso — vale pensar em recuperação

## Bug conhecido, prioridade alta
`store_orders`: 51 pedidos com `status = 'paid'` mas só 16 com `paid_at`
preenchido. Relatório que conta por status mostra 51; por `paid_at` mostra 16.
Mesmo banco, duas respostas. INVESTIGAR ANTES de mexer em checkout —
provavelmente o fluxo de pagamento não preenche `paid_at` em algum caminho.

## Regras de convivência
- Só a branch `feat/bugs`
- Leia `docs/STATUS.md` antes de começar; atualize ao terminar
- Não edite na Lovable (commita na `main` e gera conflito)
- Mudou algo que afeta dinheiro? PARE e avise o chat financeiro
