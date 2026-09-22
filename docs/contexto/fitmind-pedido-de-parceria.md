---
name: fitmind-pedido-de-parceria
description: "O que um pedido de empresa parceira cria sozinho no banco, por que não existe 'recusar parceria', e o furo que deixa qualquer usuário se aprovar"
metadata:
  node_type: memory
  type: project
---

Levantado em 22/09/2026, no caso da Aliny Okuyama. Ver [[fitmind-beneficios-de-venda]].

**Pedir parceria já dá o papel e as obrigações de parceiro, antes de qualquer
aprovação.** `upgradeExistingToPartner` (`src/lib/registration.server.ts`) grava
`partners` com status `pending` e troca `profiles.role` de `student` para
`partner` na hora. No mesmo instante, três gatilhos de `partners` criam:

- um **coach-espelho** em `coaches`, com código `EMP…` e `approved_at` nulo
  (`mirror_partner_as_coach`);
- a **mensalidade de R$ 100** (`user_subscriptions`) e a fatura do mês
  (`trg_partners_ensure_subscription`);
- a **unidade**, com a pessoa como dona em `partner_members`, e `partner_wallets`
  (`bootstrap_partner_unit`).

**O espelho aparece em /admin/coaches como coach "Pendente".** Ali, Aprovar o
transformaria em coach de verdade; Rejeitar fazia só `coaches.delete()` e deixava
a parceria `pending`, o papel `partner` e a mensalidade ativa, sem auditoria. Foi
o que aconteceu com a Aliny: o Erick "rejeitou como coach" e nada mudou para ela.
Desde 22/09/2026 a tela mostra, para linha `EMP` não aprovada, só um link para
Liberar Parceiros.

**Não existe "recusar parceria".** `partners.status` só tem `approved`,
`pending` e `blocked`; as telas de parceria só aprovam, bloqueiam ou voltam para
pendente. Criar o estado `rejected` exige antes fechar o furo abaixo — senão a
própria pessoa desfaz a recusa — e decidir o que acontece com papel, mensalidade
e `partner_members` se ela for aprovada depois.

**Furo de segurança, não corrigido em 22/09/2026.** A policy
`partners_owner_insert` só confere `profile_id = current_profile_id()`, o papel
`authenticated` tem INSERT e UPDATE em `status` e `approved_at`, e nenhum gatilho
de `partners` barra isso (`partners_ensure_approved_at` até preenche a data). Um
usuário logado consegue criar uma parceria já `approved`, ou aprovar a própria
pela policy `partners_owner_update`. O espelho nasce aprovado junto: painel de
coach, código de indicação e comissão. A correção é um gatilho BEFORE INSERT OR
UPDATE que, com `auth.uid()` não nulo e sem `is_admin`, force `pending` no
INSERT e recuse mudança de status e datas de aprovação no UPDATE. O cadastro e a
aprovação usam `supabaseAdmin` (uid nulo) e não quebram. **Cuidado:** um revoke
em `partners` já derrubou o login de todos os parceiros (22/08/2026) — testar o
login de parceiro e de colaborador depois.

**O mesmo furo existe em `coaches`, e fechar só `partners` resolve metade.** A
policy `coaches_own_insert` também confere apenas `profile_id`, o papel
`authenticated` tem INSERT em `approved_at`, `approved_by`, `activation_paid_at`,
`onboarding_stage`, `referral_code` e `is_professional`, e
`guard_coaches_self_update` é **só BEFORE UPDATE** — nenhum gatilho BEFORE INSERT
toca `approved_at`. Um aluno insere a própria linha em `coaches` já aprovada e o
painel libera, porque `coach.tsx` só olha `approved_at`. O guard precisa ser
BEFORE INSERT OR UPDATE nas duas tabelas.

**Terceiro caminho, no servidor: as funções de upgrade não exigem login.**
`upgradeExistingToPartnerFn`, `upgradeExistingToCoachFn` e
`upgradeExistingToProfessionalFn` (`src/lib/registration.functions.ts`) não têm
`.middleware([requireSupabaseAuth])` e confiam no `userId` que vem no corpo da
requisição; o middleware global (`src/start.ts`) só anexa o token, não valida.
Com o `user_id` alheio, qualquer um empurra outra pessoa para `role = partner`,
com espelho e mensalidade de R$ 100 — o estado exato da Aliny, sem ela ter
pedido. Em `upgradeExistingToProfessionalFn` isso ainda **zera o `approved_at`**
de um coach aprovado. A correção é exigir `requireSupabaseAuth` e usar
`context.userId`, ignorando o `userId` do corpo (e parar de enviá-lo em
`upgrade.$role.tsx`).

**Duas travas de "desafio", regras diferentes — decisão do Erick (22/09/2026):
só o Desafio FitMind bloqueia coach e parceiro. Desafio de corrida criado por
parceiro ou profissional é aberto a quem é coach ou parceiro.** No código: o
*Desafio FitMind* (pesagem) bloqueia quem tiver **qualquer** linha em
`partners`, sem olhar status (`challenge-tokens.functions.ts`,
`student.index.tsx`, `grant_challenge_token_on_paid`). O *desafio de corrida*
(`run_challenges`) não olha papel nem parceria — só `students.coach_id`, ticket e
datas. Na tela também: o botão "Desafio" do `MobileShell` não tem filtro, e a
tela de bloqueado de `/student/challenge` continua desenhando
`RunChallengesSection` abaixo do aviso. Não esconda a seção de corrida junto com
o Desafio FitMind.

**O desafio de corrida sumia no dia seguinte ao fim** para todo mundo, inclusive
inscritas, porque `listMyRunChallenges` filtrava `ends_on >= hoje`. Desde
22/09/2026 quem está inscrito continua vendo o card, como encerrado. O desafio da
Carol ("Outubro Rosa") tinha sido cadastrado de 01/08 a 31/08; o Erick mandou
corrigir para outubro. Os 41,1 km de agosto da Bárbara deixaram de contar para
ele (as corridas continuam em `run_logs`).

**Compras de produto de coach/parceiro não viram `transactions`.** Ficam só em
`partner_product_orders`. Toda tela que lê compras só de `transactions` mostra o
aluno sem compra: era o caso do "Rastrear aluno" (122 alunos com "Nenhuma compra
registrada"), corrigido em 22/09/2026. O que a compra concedeu está no
`metadata` do pedido (`perks_tickets`, `perks_card_days`) e em
`run_challenge_tickets.source_order_id`.

**Estado da Aliny em 22/09/2026:** compra PP-97436493 paga, ticket e inscrição
no desafio intactos. O Erick decidiu **manter** a parceria "Mimayli
Personalizados": continua `pending`, com papel `partner` e a mensalidade de
R$ 100 ativa (faturas de agosto e setembro bloqueadas — isso trava só o painel
de parceiro, não a área de aluno). Ela participa do desafio de corrida pela
regra acima.
