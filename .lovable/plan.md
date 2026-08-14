# Esconder indicação e Fitcoin do painel de aluno para quem é coach

Quem tem perfil de coach ativo continua vendo o Painel de Aluno normalmente, mas sem os blocos de indicação/cashback — esses recursos são do painel de coach e hoje aparecem duplicados.

## O que muda

Painel de Aluno (para usuários com coach ativo):
- Início: some o card "Indique e ganhe comissão" (e o modal de indicação junto).
- Perfil: some o card "Fitcoin · Cashback" com o botão "Indique e ganhe".
- Perfil: some o card "Minhas indicações" e o histórico de comissões de indicação, além do link de indicação copiável do aluno.

Para alunos comuns nada muda.

## Regra de "coach ativo"

Existe registro em `coaches` para o perfil com `onboarding_stage = 'released'` (coach liberado). Coaches ainda pendentes/bloqueados seguem vendo os blocos como aluno comum.

## Detalhes técnicos

- `src/routes/_authenticated/student.index.tsx`: já consulta `coaches` para `challengeBlocked`; ampliar essa consulta para trazer `onboarding_stage`, guardar `isCoach` no estado e condicionar o bloco "Indique e ganhe" + `StudentReferralModal`.
- `src/routes/_authenticated/student.profile.tsx`: adicionar a mesma checagem no carregamento inicial e condicionar o card de Fitcoin, o card "Minhas indicações", o modal de comissões e o `StudentReferralModal`; evitar chamar `getMyReferralCommissions` quando for coach.
- Nenhuma mudança de banco, comissões ou carteiras — apenas apresentação.
