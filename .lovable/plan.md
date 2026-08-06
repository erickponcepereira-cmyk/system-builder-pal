# Limpar a lista de "alunos sem coach confirmado"

## Diagnóstico (confirmado no banco)

Hoje a lista mostra todo aluno com a marca "pendente", mesmo quando ele já está com um coach real. Dos 6 alunos listados:

- ARLENE MORENO TEIXEIRA → já vinculada ao Fernando
- Elisangela cristina london silva → Leandro da Silva Amorim
- Elisangela criatina london silva (e-mail com erro de digitação) → Leandro da Silva Amorim
- Rogerio custodio Peres da silva → Ana Flávia Lucas
- Alexeis Hernández e Jaqueline Leite Gonçalves → Erick (coach padrão do vínculo automático)

Ou seja, só os dois últimos são realmente "sem coach confirmado". Os outros ficaram com a marca de pendência antiga mesmo após receberem coach de verdade.

## O que será feito

1. **Limpeza dos dados atuais**
   - Tirar a marca de pendência de todo aluno cujo coach atual não seja o coach padrão do vínculo automático (Erick). Esses já têm indicação válida.
   - Manter a pendência apenas de quem continua no coach padrão sem indicação confirmada.

2. **Regra permanente na lista do admin**
   - A lista passa a exibir somente alunos pendentes que ainda estão no coach padrão.
   - Se um aluno pendente já tiver outro coach, ele é considerado resolvido e sai da lista (e a marca é normalizada).

3. **Mesma regra no aviso ao aluno**
   - A tela que pede "informe seu coach" no próximo acesso só aparece para quem realmente está no coach padrão, evitando pedir de novo a quem já tem coach.

## Detalhes técnicos

- Migração idempotente: `UPDATE students SET coach_assignment_pending = false WHERE coach_assignment_pending AND coach_id IS NOT NULL AND coach_id <> 'f9a44c8a-31ea-4ca1-8cef-b9049733c5e1'`.
- `adminListPendingCoachStudents` e `getMyPendingCoachStatus` em `src/lib/pending-coach.functions.ts` passam a filtrar também por `coach_id = <coach padrão>` (id lido de uma constante única compartilhada, alinhada com `ensure_student_row_for_profile`).
- Nenhuma alteração em comissões, carteiras ou vínculos existentes.

## Validação

- Conferir que a lista do dashboard admin passa a mostrar apenas Alexeis e Jaqueline.
- Conferir no banco que Arlene/Rogério/Elisangela seguem com seus coaches e sem pendência.
