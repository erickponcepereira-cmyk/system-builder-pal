# Provas e certificado do curso

Aplicar a migração enviada exatamente como escrita, sem alterar nenhuma tela.

## Situação atual (verificada no banco)

- Nenhuma das tabelas `course_exams`, `course_exam_questions`, `course_exam_options`, `course_exam_attempts`, `course_certificates` existe.
- Nenhuma das funções `prova_para_responder`, `submeter_prova`, `gabarito_da_prova`, `emitir_certificado`, `verificar_certificado` existe.
- O frontend já está escrito e esperando esse backend: `src/lib/course-exams.ts`, o cartão de certificado do aluno e a página pública de conferência `/certificado/{codigo}`. Hoje essas telas quebram por falta das funções.

## O que a migração faz

1. Cria a estrutura de provas: uma prova final por curso ou uma prova por módulo, com nota mínima (padrão 70), limite opcional de tentativas, perguntas, alternativas e histórico de tentativas.
2. Cria o registro de certificados, com código único de verificação.
3. Acesso: o criador do curso administra as provas do próprio curso; o aluno não consegue ler as alternativas diretamente — o gabarito nunca sai do banco para o navegador.
4. O aluno responde a prova por duas funções: uma entrega a prova sem gabarito, a outra corrige no banco e devolve a nota. O gabarito comentado só aparece depois de uma tentativa registrada.
5. Emissão de certificado: exige todas as aulas que contam concluídas e, se houver prova final, aprovação nela. Chamar de novo devolve o mesmo certificado.
6. Conferência pública pelo código: devolve apenas nome, curso e data — sem e-mail, CPF, telefone ou identificador.

## Fora do escopo

Nenhum arquivo de frontend é alterado. Painel de criação/edição de provas pelo criador fica para um passo seguinte.

## Conferência depois de aplicar

- As cinco funções existem.
- Todas as políticas das cinco tabelas aparecem com `{authenticated}`, nunca `{public}`.
- Aluno logado não consegue ler `course_exam_options` diretamente.
