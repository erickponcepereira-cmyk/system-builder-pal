# Método das Janelas: data correta, escolha do dia e histórico recolhível

## Problemas confirmados

1. **Dia com 1 a mais**: o componente calcula o dia atual com `new Date().toISOString().slice(0,10)`, que usa UTC. No Brasil (UTC-3), a partir das 21h o app já mostra o dia seguinte — é exatamente o caso agora (23h39 em SP = 07/08 em UTC).
2. **Sem escolha de data**: o preenchimento é sempre travado no "hoje" calculado, então não dá para lançar um dia esquecido.
3. **Histórico sem filtro**: a lista mostra os últimos 30 dias em cards expansíveis, mas sem filtro por dia e sem opção de recolher tudo.

## O que será feito

### 1. Corrigir a data (raiz do bug)
Usar a data local do aparelho em vez de UTC em todos os pontos do Método das Janelas (preenchimento e histórico). Assim o dia exibido e o dia gravado passam a ser sempre o dia real do usuário.

### 2. Seletor de data no preenchimento
No topo do card "Método das Janelas" (tela Evolução do aluno):
- Setas "◀ dia anterior" / "dia seguinte ▶" e um campo de data para escolher qualquer dia.
- Bloqueio de datas futuras (só é possível lançar hoje ou dias passados).
- Botão "Hoje" para voltar rápido.
- Ao trocar a data, o formulário carrega o registro daquele dia (ou vazio) e salva no dia escolhido — permitindo lançar/alterar dias anteriores.
- Aviso visual quando a data selecionada não é hoje ("Você está lançando o dia 05/08").

### 3. Histórico recolhível e filtrável
No card de histórico:
- O bloco inteiro passa a ser recolhível (fechado por padrão, com contador de registros).
- Filtro por dia: campo de data para pular direto para um registro, mais atalhos rápidos (7 / 30 dias / todos).
- Cada dia continua expansível individualmente; adiciono botão "Recolher tudo".
- Em cada dia do histórico, atalho "Editar este dia" que leva o formulário acima para aquela data (quando é o próprio aluno).

## Detalhes técnicos

- `src/lib/date-only.ts`: adicionar `todayISOLocal()` (YYYY-MM-DD em horário local) e reutilizar `parseDateOnly` para exibição.
- `src/components/student/WindowMethod.tsx`: `targetDate` passa a ter estado interno (inicializado por `todayISOLocal()` ou pela prop `date`), com navegação de datas e trava de datas futuras; upsert continua usando `student_id,log_date`.
- `src/components/student/WindowMethodHistory.tsx`: envelope recolhível, filtro por data/período e callback opcional `onEditDate` para integrar com o formulário.
- `src/routes/_authenticated/student.evolution.tsx`: liga o histórico ao formulário via estado de data compartilhado.
- Sem mudanças de banco de dados; `window_method_logs` já é por `log_date`.
