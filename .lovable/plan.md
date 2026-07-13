## Plano de correção

1. **Corrigir a seleção do desafio na tela de resultados**
   - Ajustar o fluxo onde a avaliação já está salva e o coach tenta vincular ao desafio pela tela de resultados/comparativo.
   - Garantir que o sistema reconheça o aluno vinculado mesmo quando o `clientId` mudou após integração/mesclagem.

2. **Salvar o vínculo e sincronizar a inscrição do desafio**
   - Ao escolher “Vincular como Pesagem Inicial/Final”, gravar na avaliação:
     - aluno vinculado
     - inscrição do desafio
     - tipo da pesagem
   - Garantir que a inscrição do desafio receba peso, gordura corporal, massa muscular e status correto.

3. **Tratar falhas silenciosas**
   - Se o vínculo não puder ser feito por falta de aluno vinculado, inscrição inválida ou permissão, mostrar erro claro em vez de parecer que salvou sem efeito.
   - Evitar `.single()` em pontos onde podem existir duplicatas ou nenhum resultado.

4. **Atualizar estado da tela após salvar**
   - Depois de vincular, atualizar a avaliação em memória para aparecer como vinculada imediatamente.
   - Recarregar os candidatos pendentes do desafio para remover a opção já usada.

5. **Verificação final**
   - Conferir no código que o fluxo “resultado/comparativo → editar avaliação → vincular ao desafio → salvar” atualiza `coach_body_assessments` e `competition_enrollments` corretamente.