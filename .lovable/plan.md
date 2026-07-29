## Diagnóstico (verificado no banco)

**1. Avaliações da Fabiana sumiram — causa confirmada**

A função de unificação de contas (`admin_merge_profiles`) tem este trecho:

```text
UPDATE tabela SET coluna = alvo WHERE coluna = origem
EXCEPTION unique_violation -> DELETE FROM tabela WHERE coluna = origem
```

A tabela `coach_evaluation_clients` tem índice único em `student_id`. A conta principal (Gmail) já tinha uma ficha para o mesmo aluno, então o UPDATE deu conflito e o código **apagou a ficha da conta antiga**. Como `coach_body_assessments.client_id` tem `ON DELETE CASCADE`, as avaliações vinculadas foram removidas junto.

Confirmei: hoje não existe nenhuma linha em `coach_body_assessments` para essa cliente/aluna, e nada em `coach_assessment_deletions` (não foi exclusão pela UI).

A função também faz `DELETE FROM students` da conta antiga — e existem **26 tabelas com cascata a partir de `students`** (protocolos, anamnese, água, janelas, fitcoin, agendamentos, cupons, reservas...). Ou seja: risco de perda em qualquer nova mesclagem.

Sobre recuperar os dados apagados: eles foram removidos fisicamente e não há snapshot dessas linhas no banco. A recuperação depende de backup point-in-time do provedor; caso não exista, a avaliação precisará ser refeita pela coach. Vou verificar essa possibilidade como primeiro passo da execução.

**2 e 3. Link de compartilhamento e "ver avaliação completa" no painel do aluno — mesma causa**

A página pública `/resultado/{token}` funciona (testei e renderizou o relatório completo). O problema está no painel do aluno: `src/routes/_authenticated/student.assessments.tsx` só mostra o botão "Ver relatório completo" se já existir um token em `assessment_shares` — e a única política de acesso dessa tabela é `coach_id = coach logado`. **O aluno nunca consegue ler o token**, então o link nunca aparece e o compartilhamento parece quebrado do lado dele.

## O que será feito

### A. Blindar a unificação de contas (migração)
- Substituir o `DELETE` em caso de conflito por **manter o registro na conta antiga** e reportá-lo como "não movido" no log de auditoria — a função nunca mais apaga dados.
- Remover os `DELETE FROM students` / `DELETE FROM coaches`; a conta antiga fica apenas marcada como unificada.
- Caso especial de fichas de avaliação: quando as duas contas tiverem ficha, **transferir as avaliações da ficha antiga para a ficha da conta principal** e apenas desvincular a ficha antiga (em vez de apagá-la).
- Registrar no log tanto o que foi movido quanto o que ficou retido por conflito.

### B. Link completo da avaliação no painel do aluno
- Nova função de servidor `getOrCreateMyAssessmentShare` (autenticada) em `src/lib/assessment-share.functions.ts`: valida que a avaliação pertence ao aluno logado e devolve/gera o token, sem depender das permissões de leitura da tabela de compartilhamentos.
- `student.assessments.tsx`: botão **"Ver avaliação completa"** sempre visível em cada avaliação, chamando essa função e abrindo `/resultado/{token}`; e botão **"Compartilhar"** que copia o link canônico (`getShareOrigin()`), útil quando o aparelho não suporta compartilhamento nativo.
- Remover a consulta direta a `assessment_shares` que hoje retorna vazio para o aluno.

### C. Verificação
- Rodar simulação (dry-run) da unificação corrigida em um par de contas de teste e conferir que nada é apagado.
- Abrir o painel do aluno no navegador e validar que o botão aparece e que a página completa carrega.

## Detalhes técnicos
- Migração: `CREATE OR REPLACE FUNCTION public.admin_merge_profiles(uuid, uuid, uuid, boolean)` com o bloco `EXCEPTION` alterado para acumular `skipped` em vez de deletar; grants mantidos para `authenticated`/`service_role`.
- Nenhuma alteração em `coach_body_assessments`, RLS de coach ou na página pública `/resultado/$token`.
