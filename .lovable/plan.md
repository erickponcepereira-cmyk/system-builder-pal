# Desafio de KM do mês (rede da Carol) + configuração no painel profissional

## O que será criado

Um novo tipo de desafio — **desafio de quilometragem mensal** — que convive com o Desafio FitMind (emagrecimento) já existente, sem alterá-lo.

- Cada desafio tem: nome, período (dia de início e dia de fim), produto vinculado (ticket de entrada) e faixas de meta. Para a Carol: **50 km, 100 km e 150 km** — a pessoa escolhe uma ao entrar.
- Podem participar **alunos, coaches, parceiros e profissionais** (diferente do desafio de emagrecimento, que bloqueia esses perfis).
- Quem compra o **produto "Desafio de Corrida" da Carol** ganha um ticket que serve **apenas para os desafios dela**.
- Ao bater a meta, a contagem continua, mas o participante fica marcado como "meta batida" com a **data exata** em que bateu.

## Aba Desafio do aluno

Reorganizada em duas seções:

1. **Em destaque** — desafios de corrida disponíveis para a pessoa (hoje, os da rede da Carol). Cada card mostra período, faixas, quanto a pessoa já correu no período e a barra de progresso.
   - Sem ticket: botão de compra do produto da Carol direto no card (mesmo padrão PIX/cartão já usado no Ticket Tradicional), e após o pagamento aprovado aparece **"Ir para o desafio"** para escolher a faixa na hora.
   - Com ticket: escolha da faixa (50/100/150) e confirmação de entrada.
   - Já inscrito: painel de acompanhamento com km acumulado, faltando X km, e selo "Meta batida em DD/MM" quando atingir.
2. **Desafio FitMind** — o bloco atual de emagrecimento, movido para baixo, sem mudanças de regra.

Quem não tem nenhum desafio de corrida liberado continua vendo a tela como é hoje.

## Origem dos quilômetros

Os km vêm dos registros de corrida que a pessoa já lança no painel de Evolução (módulo Corrida). Para valer no desafio, **cada registro precisa da foto do print do dia no Nike Run** — registros sem foto aparecem como "não contabilizado" com o motivo.

Aviso fixo no topo dos cards: *"Os quilômetros são validados pelo print do Nike Run. Nosso sistema próprio de corrida está em desenvolvimento e em breve tudo será automático."*

## Painel do profissional (Carol)

Nova aba **"Desafios de corrida"**, no mesmo espírito da tela de admin do desafio de emagrecimento, onde ela pode:

- criar/editar/encerrar desafios: nome, descrição, data de início e fim, produto vinculado;
- definir as faixas de meta (km) — quantas quiser, começando com 50/100/150;
- ver a lista de inscritos por faixa, km atual, quem bateu a meta e quando;
- validar/rejeitar registros duvidosos (o registro sai da soma quando rejeitado).

A mesma tela fica disponível no Admin para qualquer desafio de corrida da plataforma.

## Detalhes técnicos

Novas tabelas (todas com GRANT + RLS):

- `run_challenges` — `owner_profile_id` (dono/profissional), `name`, `description`, `starts_on`, `ends_on`, `product_id` (produto profissional/parceiro que libera o ticket), `visibility` (rede do dono) e `is_active`.
- `run_challenge_tiers` — `challenge_id`, `label`, `target_km`, `sort_order`.
- `run_challenge_tickets` — `profile_id`, `challenge_id` (ou `owner_profile_id` para valer em qualquer desafio do dono), `source_order_id`, `consumed_entry_id`. Concedido pelo mesmo caminho que já entrega carteirinha/ticket em compra aprovada (`grant_partner_product_perks` / `renovar_pedido_recorrente`), quando o produto for o vinculado.
- `run_challenge_entries` — `challenge_id`, `tier_id`, `profile_id`, `joined_at`, `goal_reached_at`, `km_at_goal`, único por (challenge, profile).

Contagem: função `run_challenge_progress(_challenge_id, _profile_id)` somando `run_logs` no intervalo do desafio com `photo_url` não nulo e não rejeitado (nova coluna `review_status` em `run_logs`, default `pending`/`ok`). Um trigger em `run_logs` grava `goal_reached_at` na primeira vez que o acumulado cruza a meta da faixa escolhida.

Acesso: elegibilidade pela cadeia de coaches (`cadeia_coaches_do_perfil`) até o dono do desafio, como já é feito na restrição de produto por rede — por isso funciona para coach/parceiro/profissional, que têm perfil mas não são "aluno puro".

Front-end: `src/routes/_authenticated/student.challenge.tsx` ganha a seção de destaque; novos componentes em `src/components/challenge/running/`; nova aba em `src/routes/_authenticated/professional.tsx` com editor em `src/components/professional/RunChallengesPanel.tsx`; leitura/escrita via `src/lib/run-challenges.functions.ts`.
