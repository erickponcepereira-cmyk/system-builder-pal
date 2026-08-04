# Fazer o botão "Avaliar Final" abrir a avaliação do aluno

## O que acontece hoje

Ao clicar em "Avaliar Inicial"/"Avaliar Final", o painel só marca o aluno como "vinculado ao desafio" e espera que a tela do Diagnóstico 360 encontre esse aluno na lista carregada. Quando a ficha usada não está exatamente com o mesmo identificador da lista (caso comum quando a ficha foi criada por outro coach e o sistema junta cadastros repetidos), nada abre e nenhuma mensagem aparece. Também não é forçada a abertura de uma **nova** avaliação: a tela pode continuar no modo de consulta.

## Correções

1. **Abrir sempre a ficha do aluno**
   - O botão passa a informar também o aluno (não só a ficha), e a tela de avaliação localiza o aluno pela ficha ou pelo aluno vinculado.
   - Se a ficha ainda não estiver na lista no momento do clique, a abertura acontece assim que a lista terminar de carregar (em vez de falhar em silêncio).
   - Se mesmo assim não for possível abrir, aparece uma mensagem explicando o motivo.

2. **Entrar direto no preenchimento**
   - O clique passa a abrir uma avaliação nova (primeiro passo do formulário), igual ao fluxo manual de "nova avaliação", em vez de cair em resultado antigo.
   - Funciona em cliques repetidos no mesmo aluno.

3. **Manter o vínculo com a pesagem final**
   - Com a ficha aberta, o tipo "Pesagem Final" já vem pré-selecionado no vínculo, e a lista de vínculo considera o aluno da inscrição mesmo quando a ficha veio de outro coach.

## Detalhes técnicos

- `src/components/coach/tabs/EvaluateTab.tsx`
  - `linkChallengeCandidate`: incluir `studentId` no `challengeLink` já resolvido e não abortar quando o `preferredClientId` não aparece na lista pós-dedup; usar `clientAliasRef` e fallback por `studentId`; `toast.error` no caso final.
  - Passar `initialStudentId={challengeLink?.studentId}` e `initialIntent="new"` para `FitMindShape`.
- `src/components/coach/FitMindShape.tsx`
  - Efeito de pré-seleção (linhas 485-498): procurar por `id === initialClientId` **ou** `studentId === initialStudentId`; não gravar `autoSelectedRef` enquanto o cliente não for encontrado (permite reagir ao próximo carregamento de `clients`); definir `setEntryIntent("new")` antes de `setScreen("assessment")`.
- `src/components/coach/AssessmentComparison.tsx`: manter a pré-seleção do tipo vindo do botão (Pesagem Final) na caixa de vínculo.
- Sem mudanças de banco.
