# Lista de pesagem do desafio: mostrar todos, buscar por nome e separar por coach

## O que foi verificado

No banco existem 35 inscrições, sendo 30 ainda ativas (sem pesagem final ou canceladas), distribuídas em 6 turmas (Jul/2026 turmas 1–4 e Ago/2026 turmas 1–2). Todas têm aluno e coach vinculados.

Dois pontos explicam alunos "sumindo" da lista de pesagem:

1. **Janela de datas**: a lista só mostra inscrições da data de abertura da turma até 7 dias após a pesagem final. A Turma 1 de Jul/2026 (pesagem final 04/08) sai da lista a partir de amanhã (11/08), mesmo com a pesagem final ainda pendente.
2. **Aluno sem nome/perfil legível**: quando o cadastro do aluno não retorna junto (perfil não visível para o coach logado), a inscrição é descartada silenciosamente em vez de aparecer com o nome disponível.

Além disso a lista é um bloco corrido sem busca nem agrupamento, o que faz parecer que o aluno não está lá.

## O que será feito

1. **Nenhum aluno some**
   - Remover o corte de 7 dias após a pesagem final: enquanto a pesagem estiver pendente, a inscrição continua na lista (com aviso "prazo encerrado em dd/mm" quando fora da janela).
   - Manter na lista inscrições cujo cadastro do aluno não veio completo, exibindo o nome disponível em vez de descartar.
   - Ampliar o teto de carregamento (hoje 500) e paginar internamente, de modo que não haja limite prático.

2. **Busca por nome**
   - Campo de busca no topo do bloco "Alunos com Desafio ativo aguardando avaliação", filtrando por nome do aluno (ignora acentos e maiúsculas) e também por nome do coach.

3. **Separar por coach**
   - Agrupamento por coach responsável, com cabeçalho por coach (nome + contagem) e blocos recolhíveis.
   - Filtro rápido por coach (lista suspensa "Todos os coaches" / coach específico) para quem é Master/admin.
   - Filtros complementares por tipo (Inicial/Final) e por turma, mantendo as cores atuais (vermelho = inicial, amarelo = final).
   - Contador total continua no cabeçalho e passa a refletir o filtro aplicado ("12 de 30").

## Detalhes técnicos

- `src/components/coach/tabs/EvaluateTab.tsx`
  - `loadChallengeCandidates`: retirar o descarte por `grace` (manter apenas sinalização visual `outOfWindow`), não exigir `student.profile`, buscar em páginas de 1000 via `range()` até esgotar, e resolver nomes de coach para todos os `coachId` (não só os diferentes do coach logado).
  - Novo estado local de UI: `challengeSearch`, `challengeCoachFilter`, `challengeTypeFilter`; derivar `filteredCandidates` e `groupedByCoach` com `useMemo`.
  - Bloco do banner reescrito: input de busca + selects de coach/tipo + seções por coach; cada card mantém o botão "Avaliar Inicial/Final" e o handler `linkChallengeCandidate` atual.
- Sem alterações de banco e sem mudança nas regras de pesagem, pontuação ou vínculo de avaliação.
