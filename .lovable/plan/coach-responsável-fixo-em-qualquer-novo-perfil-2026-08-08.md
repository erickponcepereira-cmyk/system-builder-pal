# Coach responsável fixo em qualquer novo perfil

## Problema

Na tela "Tornar-se Coach / Profissional / Empresa Parceira" (acessada pelo painel de aluno), o campo "Coach indicador" aparece aberto para escolher qualquer coach da lista. Isso permite que a pessoa troque de coach ao virar profissional/parceiro/coach — e, quando ela escolhe outro, o novo cadastro (coach/parceiro/profissional) fica com um patrocinador diferente do coach que ela já tem como aluna.

Regra correta: uma vez que o aluno tem coach responsável confirmado, esse vínculo é definitivo e vale para todos os perfis que ele criar depois.

## O que muda

1. Ao abrir a tela de upgrade, o sistema busca o coach já vinculado à conta:
   - primeiro o coach do cadastro de aluno (quando já confirmado);
   - se não houver, o patrocinador de um cadastro de coach/parceiro existente;
   - se ainda assim não houver, cai na indicação do link `/r/{code}` como hoje.
2. Se um coach for encontrado, o campo aparece preenchido e **bloqueado**, com a mensagem "Coach responsável já vinculado à sua conta — não pode ser alterado".
3. Só quem realmente não tem coach algum continua vendo a busca para escolher.
4. No servidor, os três fluxos de upgrade passam a **ignorar** o coach enviado pela tela quando a conta já tem coach vinculado, usando sempre o coach real. Assim, mesmo que alguém tente burlar pela requisição, o vínculo é mantido.
5. Enquanto o coach vinculado está carregando, o botão de enviar fica desabilitado, evitando envio com coach errado.

## Detalhes técnicos

- Nova função de servidor autenticada `getMyBoundCoachFn` (em `src/lib/registration.functions.ts` + helper em `registration.server.ts`): resolve, para o `user_id` logado, `students.coach_id` (quando `coach_assignment_pending = false`), senão `coaches.upline_coach_id`, senão `partners.upline_coach_id`; retorna `{ coachId, coachName }`.
- Helper compartilhado `resolveBoundCoachId(profileId)` no servidor, aplicado no início de `upgradeExistingToCoach`, `upgradeExistingToProfessional` e `upgradeExistingToPartner`: `const uplineCoachId = (await resolveBoundCoachId(profile.id)) ?? input.uplineCoachId`, com a validação existente de "não pode ser você mesmo".
- `src/routes/_authenticated/upgrade.$role.tsx`: carrega o coach vinculado no mount (antes da leitura de `readReferralSignup`), define `upline` e `uplineLocked = true` quando existir; mantém o fluxo atual quando não existir.
- `CoachSelector` já suporta `locked`; apenas o texto auxiliar é ajustado para refletir "coach responsável definitivo".
- Sem mudança de banco de dados.
