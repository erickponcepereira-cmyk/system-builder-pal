# Permitir finalizar desafio sem campeã feminina

## Situação

No modal "Finalizar Desafio" o botão "Finalizar e publicar" só habilita quando há campeão masculino E campeã feminina selecionados. Na edição Julho 2026 nenhuma mulher teve resultado positivo de perda de gordura, então a coluna feminina fica vazia e a finalização trava.

## O que será feito

1. **Gênero sem participante elegível**
   - Quando a lista de um gênero estiver vazia, exibir a mensagem clara: "Sem campeã feminina para esta edição" (e equivalente masculino: "Sem campeão masculino para esta edição"), em vez de "Nenhum participante com resultado positivo".

2. **Liberar a finalização**
   - O botão passa a exigir apenas: para cada gênero que tenha ao menos um participante elegível, um vencedor selecionado. Gênero sem elegíveis é aceito como "sem campeão/campeã".
   - Se nenhum dos dois gêneros tiver elegíveis, o botão continua bloqueado.
   - Ao finalizar, o Hall da Fama recebe apenas o(s) vencedor(es) existente(s); o log de finalização grava `winner_female_enrollment_id` como nulo, o que o banco já aceita.

3. **Texto de apoio**
   - Ajustar a descrição do modal para: selecione o vencedor de cada gênero que tenha participantes com resultado positivo; gêneros sem resultado ficam registrados como "sem campeão(ã)".
   - Adicionar um link "Dúvidas? Leia as regras da competição" no modal. O link abre o Termo de participação já existente (as 14 declarações de `CHALLENGE_ACCEPTANCE_DECLARATIONS` em `src/lib/terms.ts`) em um modal somente-leitura, sem checkboxes, para consulta — mesmo texto que o participante aceita ao entrar no desafio.

## Detalhes técnicos

- Arquivo único: `src/routes/_authenticated/admin.challenge.tsx`
  - `finalizeChallenge`: substituir as validações obrigatórias de `winnerMaleId`/`winnerFemaleId` por validação condicional à existência de elegíveis por gênero (mesma regra de filtro `> 0` já usada no modal).
  - `renderList`: mensagem de vazio parametrizada por gênero.
  - `disabled` do botão: `finalizing || (temMasculinos && !winnerMaleId) || (temFemininas && !winnerFemaleId) || (!temMasculinos && !temFemininas)`.
- Sem alteração de banco: `competition_finalization_log.winner_female_enrollment_id` já aceita nulo e o insert no Hall da Fama já é condicional.
