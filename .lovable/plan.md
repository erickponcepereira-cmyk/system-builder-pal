## Diagnóstico

Fernando Arruda **está** cadastrado como aluno (profile ativo + linha em `students`, coach = Lucinei Correa Almeida). Ele não aparece na aba de bioimpedância porque essa tela lista os registros da tabela `coach_evaluation_clients` (via RPC `coach_evaluation_client_summaries`), e Fernando **não tem** uma linha lá.

Hoje a linha em `coach_evaluation_clients` só é criada:
- quando o coach abre manualmente o vínculo de desafio para o aluno (código em `EvaluateTab.tsx` linhas ~388–423), ou
- quando o coach cria um cliente à mão.

Não existe trigger nem hook no cadastro do aluno que crie essa ficha. Resultado: **todo aluno que se cadastra pelo link do coach fica invisível na aba Avaliar até ser "tocado" por algum outro fluxo**. Auditando o banco agora, **71 alunos estão sem ficha de avaliação** — Fernando é apenas o caso reportado.

## Correção

Uma única migration que resolve o passado e o futuro:

### 1. Trigger `AFTER INSERT` em `public.students`
Cria automaticamente a linha correspondente em `coach_evaluation_clients` já vinculada por `student_id`, puxando nome / email / whatsapp / avatar / gênero / altura / peso do `profiles` + `students`. Idempotente (não recria se já existir uma linha com o mesmo `student_id` para aquele coach).

### 2. Trigger `AFTER UPDATE OF coach_id` em `public.students`
Cobre transferências de aluno entre coaches: garante ficha no novo coach (a ficha antiga fica preservada com o histórico).

### 3. Backfill único
Insere ficha para todos os 71 alunos existentes que hoje não têm `coach_evaluation_clients` — incluindo Fernando. Usa os mesmos campos do trigger.

### Detalhes técnicos

- Função `public.ensure_coach_evaluation_client_for_student(student_id uuid)` `SECURITY DEFINER`, `SET search_path = public`, faz o `INSERT ... WHERE NOT EXISTS`.
- Trigger `trg_students_ensure_eval_client` (AFTER INSERT OR UPDATE OF coach_id) chama a função.
- Mapeamento de gênero: `profiles.gender` (`M`/`F`/`O`) → `coach_evaluation_clients.gender` (`male`/`female`/`other`); NULL vira `other`.
- `groups` inicia como `{}` (default) — o coach classifica depois se quiser.
- `GRANT EXECUTE` na função para `authenticated` e `service_role` (o trigger roda como definer, mas mantém explícito para chamadas manuais no admin, se precisar).
- Backfill roda **antes** de criar o trigger para evitar dupla escrita durante a mesma transação.

Nenhuma mudança de front-end é necessária — a aba Avaliar passa a listar todos os alunos automaticamente. Após a migration, Fernando aparece imediatamente para o coach Lucinei fazer a bioimpedância, e o problema não se repete para novos cadastros nem para transferências.