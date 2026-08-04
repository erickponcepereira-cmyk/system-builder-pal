# Corrigir "Avaliar Final" e o vínculo da pesagem final

## O que está acontecendo

Ao clicar em "Avaliar Final" no painel do coach, o sistema procura (ou cria) uma ficha de avaliação para aquele aluno **dentro do coach logado**. Verificado no banco: boa parte dos inscritos do desafio já tem ficha de avaliação criada **por outro coach** (o coach original da inscrição). Nesses casos:

- o coach logado (Master, que enxerga todos) acaba criando uma ficha nova;
- a tela agrupa fichas repetidas do mesmo aluno e mantém apenas uma delas;
- a ficha que a tela tentaria abrir é justamente a descartada, então **nada acontece** ao clicar no botão.

O mesmo agrupamento faz a ficha aberta perder a ligação com o aluno em alguns casos, e por isso a caixa "Vincular avaliação ao desafio" aparece vazia (sem a opção "Pesagem Final").

## Correções

1. **Abrir a avaliação de verdade**
   - Ao clicar em "Avaliar Final"/"Avaliar Inicial", reutilizar a ficha existente do aluno (de qualquer coach, quando o usuário é Master ou admin) em vez de criar uma nova.
   - Se a ficha usada tiver sido agrupada com outra, apontar para a ficha que realmente está na lista, para a tela abrir a avaliação.
   - Se ainda assim não houver ficha, criar e só então abrir, sem depender do agrupamento.
   - Mensagem de erro visível caso algo falhe (hoje falha em silêncio).

2. **Sempre oferecer "Pesagem Final" no vínculo**
   - A lista de vínculo passa a considerar o aluno da ficha aberta e também as inscrições já carregadas do desafio (inicial e final), inclusive quando a ficha veio de outro coach.
   - Quando o clique veio do botão "Avaliar Final", o tipo já entra pré-selecionado como Pesagem Final.
   - Quando não houver nenhuma pendência, mostrar o motivo (ex.: "pesagem final já registrada" ou "fora da janela da turma").

3. **Janela de datas**
   - Manter a regra atual (da abertura da turma até 7 dias após a pesagem final), mas informar na tela quando a inscrição estiver fora da janela, em vez de sumir sem explicação.

## Detalhes técnicos

- `src/components/coach/tabs/EvaluateTab.tsx`
  - `linkChallengeCandidate`: buscar `coach_evaluation_clients` por `student_id` (sem travar em `coach_id`) para Master/admin; tratar múltiplas linhas (`maybeSingle` quebra com duplicatas); resolver o id sobrevivente do dedup (`sid:<studentId>`) antes de setar `preferredClientId`; `toast.error` em falha.
  - Dedup: preservar `studentId` ao mesclar e guardar os ids alternativos para mapear `preferredClientId`.
  - `getChallengeCandidatesForClient`: casar por `studentId` da ficha ou do candidato ligado ao mesmo aluno, sem exigir que a ficha pertença ao coach logado.
- `src/components/coach/FitMindShape.tsx`: `autoSelectedRef` deve permitir reabrir o mesmo aluno em cliques subsequentes (usar chave `clientId + tipo/timestamp`).
- `src/components/coach/AssessmentComparison.tsx`: mensagem explicativa quando `challengeCandidates` estiver vazio e pré-seleção do tipo vindo do botão.
- Sem mudanças de banco.
