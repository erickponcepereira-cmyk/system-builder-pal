# Nathan como Nutricionista + trava do coach original

## O que foi confirmado

- Nathan Utuari (nathan.utuari@gmail.com) tem perfil `admin`, já tem cadastro de coach aprovado e liberado, com `is_professional = false` e sem especialidade. Ele é raiz da rede: não tem coach acima dele, e o registro de aluno dele aponta para o próprio cadastro de coach.
- O fluxo público "Quero ser Profissional" bloqueia contas admin (mensagem "Administradores não podem ser convertidos via cadastro público"), então o cadastro dele precisa ser feito direto no banco.
- O seletor de coach aparece por causa de um caso não tratado: quando o coach vinculado à conta é o **próprio** cadastro de coach da pessoa (caso de quem é raiz ou é o próprio coach responsável), a busca do "coach vinculado" devolve vazio e a tela abre o seletor livre — dando a impressão de que dá para trocar de coach.

## O que será feito

### 1. Cadastro de profissional do Nathan (nutricionista)

Atualizar o cadastro de coach existente dele para também ser profissional:
- especialidade: Nutricionista
- mantém o mesmo cadastro de coach, o mesmo código de indicação, a mesma rede e a posição dele como raiz (nenhum coach acima é criado ou alterado)
- mantém aprovado e liberado — sem passar pela fila de "Liberar Profissionais" e sem cobrança de ativação
- perfil continua admin, então ele segue com acesso de admin, coach e agora profissional

### 2. Coach original nunca mais some do formulário

Nas telas de "Quero ser Coach / Profissional / Parceira":
- quando o coach vinculado for o próprio cadastro de coach da pessoa (ou ela for raiz da rede, sem ninguém acima), o campo deixa de abrir o seletor: aparece bloqueado com a explicação de que o vínculo já existe e não muda.
- o seletor de busca só continua aparecendo para quem realmente nunca teve coach algum.
- no servidor, os três fluxos de upgrade continuam ignorando o coach enviado pela tela e mantêm o vínculo real da conta, inclusive nesse caso de raiz (mantendo o coach acima já existente, mesmo quando não há nenhum).

## Detalhes técnicos

- Migração de dados (não é mudança de estrutura): `UPDATE public.coaches SET is_professional = true, specialty_key = 'nutritionist', specialty_pending_setup = false, onboarding_stage = 'released'` para o coach `0dc01639-…` do perfil `6714e367-…`, preservando `approved_at`, `upline_coach_id` (NULL) e `referral_code`.
- `getBoundCoachForUser` (src/lib/registration.server.ts): quando `resolveBoundCoachId` devolver o coach do próprio perfil, retornar `{ selfCoach: true }` em vez de `null`, para a tela poder travar o campo.
- `resolveBoundCoachId`: quando o perfil já tem cadastro de coach, considerar também o caso `upline_coach_id IS NULL` como "vínculo definido" (raiz), evitando cair no coach enviado pela tela.
- Nos três `upgradeExisting*` de registration.server.ts: se o perfil já tem cadastro de coach, não sobrescrever `upline_coach_id` com o valor vindo do cliente — preservar o valor atual (inclusive NULL).
- `src/routes/_authenticated/upgrade.$role.tsx` e `src/components/auth/CoachRegistration.tsx`: tratar o novo retorno, exibindo campo travado com o texto "Coach responsável já vinculado à sua conta — não pode ser alterado" (ou "Você é raiz da própria rede" quando não houver coach acima) e liberar o botão de envio nesse estado.
