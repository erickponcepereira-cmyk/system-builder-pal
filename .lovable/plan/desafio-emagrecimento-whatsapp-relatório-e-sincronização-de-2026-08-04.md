# Desafio Emagrecimento: WhatsApp, relatório e sincronização de coach

## 1. WhatsApp do aluno na lista

- Nova coluna "WhatsApp" na tabela de inscritos de cada turma (Admin → Desafio Emagrecimento).
- Mostra o número como cadastrado na conta do aluno (formato digitado) e o próprio número é o link: abre a conversa direta no WhatsApp.
- Sem número cadastrado: exibe "—".

## 2. Botão "Relatório"

- Botão no topo de cada edição/turma que gera um relatório agrupado por coach:
  - Coach (nome)
    - Aluno · telefone
- Duas saídas no mesmo modal: visualizar/imprimir (vira PDF pelo navegador) e baixar CSV.

## 3. Botão "Sincronizar coaches"

- Botão na edição que atualiza o coach responsável de cada inscrição para o coach atual do aluno (caso da Josiete: Erick → Nathan).
- Mostra um resumo do que mudou ("3 inscrições atualizadas") e recarrega a lista.
- Só altera edições ainda não finalizadas.

## 4. Pesagem final: notificação + relatório automático

- Na virada do dia (00:05, horário de Cuiabá) o sistema verifica as turmas cujo dia de pesagem final é hoje.
- Para cada turma encontrada:
  - Antes de gerar, sincroniza os coaches das inscrições (mesma rotina do botão).
  - Cria uma notificação para os administradores: "Pesagem final hoje — Turma X (Mês/Ano)", com link para a tela do desafio.
  - O relatório do dia fica disponível na tela, marcado como gerado automaticamente (mesma lista agrupada por coach com telefones).

## Detalhes técnicos

- `src/routes/_authenticated/admin.challenge.tsx`: incluir `profile:profile_id ( name, phone )` no select de `student` das inscrições; nova coluna usando `whatsappUrl()` de `src/lib/whatsapp.ts`; modal de relatório (agrupado por coach) com impressão e CSV; botão de sincronização.
- Novo `src/lib/challenge-admin.functions.ts` (server fns com `requireSupabaseAuth` + verificação de admin):
  - `syncEnrollmentCoaches({ competitionId })` — atualiza `competition_enrollments.coach_id` a partir de `students.coach_id`, retorna contagem e lista de alterações.
  - `getChallengeReport({ competitionId })` — retorna linhas (coach, aluno, telefone, turma) para o modal/CSV.
- Migração: tabela `challenge_final_reports` (competition_id, group_id, report_date, payload jsonb, created_at) com GRANTs e RLS somente-admin, guardando o relatório gerado automaticamente; índice único por (group_id, report_date) para não duplicar.
- Rota `src/routes/api/public/hooks/challenge-final-weighin.ts` (POST): busca turmas com `final_weigh_in_date` = hoje em `America/Cuiaba`, sincroniza coaches, grava o relatório e insere `notifications` para os perfis com papel admin. Agendada via `pg_cron` + `pg_net` às 00:05 local.

## Fora do escopo

- Envio de mensagem automática por WhatsApp aos alunos.
- Mudanças nas regras de pontuação, pesagem ou premiação.
