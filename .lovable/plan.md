# Número da balança no Resumo da avaliação

Hoje o número da balança é obrigatório em "Dados Básicos" ao avaliar o aluno, mas não aparece na tela de resultado da avaliação.

## O que muda

- No card **Resumo** da tela "Resultado da Avaliação" (a mesma vista no painel do coach e no link público `/resultado/{token}`), incluir a linha **"Balança"** com o número cadastrado na avaliação.
- A linha mostra o número da avaliação mais recente; quando a avaliação não tiver número registrado (fichas antigas), exibe "—".

## Detalhes técnicos

- `FitMindShapeResultView.tsx`: adicionar um item na lista do bloco Resumo usando `a.scaleNumber` (campo já existente em `FitMindAssessment`, gravado como `scale_number`).
- Confirmar que a rota pública `resultado.$token.tsx` inclui `scale_number` no mapeamento para o componente; se não incluir, adicionar (somente leitura, sem mudança de dados nem de permissões).

## Fora do escopo

- Nenhuma mudança em banco de dados, validações de cadastro ou cálculo de indicadores.
