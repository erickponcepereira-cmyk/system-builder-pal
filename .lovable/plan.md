
# Protocolo & Treino — Plano de implementação

Vou dividir em 4 frentes. É um escopo grande, então confirme antes de eu começar.

## 1. Saúde e Metas — Cálculo automático de água

Na tela `student.health.tsx`, substituir o campo manual de "Meta de água" por cálculo automático baseado em:
- **Peso** (puxado da última bioimpedância FitMindShape ou da tabela `students`)
- **Idade** (puxada do `profiles.birth_date`)

Fórmula:
- Até 17 anos: `peso × 40ml + 1000ml` (fixo: exercício + calor regional)
- 18 a 64 anos: `peso × 35ml + 1000ml`
- 65+ anos: `peso × 30ml + 1000ml`

Mostrar o cálculo explicado ("Seu peso 75kg × 35ml + 1000ml = 3625ml/dia") para transparência.

## 2. Renomeações e ajustes pequenos

- "Biblioteca" → "Criar exercícios" (no menu do coach/profissional)
- **Ficha do aluno (resumo)**: exibir bloco de **Restrições** e **Observação geral** (campos já existem na anamnese — só puxar e exibir).
- **Biblioteca atual**: permitir editar exercícios prontos (apenas exercícios individuais, não treinos completos).

## 3. Configuração de Treino (lado coach/profissional)

Reformular o construtor de treino para:
- Seletor por **nome do treino** + **dia da semana** (ex: "Treino A — Segunda", "Treino B — Quarta")
- Cada exercício: séries, repetições, carga sugerida, **tempo de descanso**, configuração do aparelho, GIF/imagem/link demonstrativo, observações
- Bloco separado para **Cardio** com pace/velocidade/elevação configuráveis

## 4. Painel "Meu Treino" (aluno) — Gamificado

Nova rota `student.workout.tsx` com fluxo completo:

### Execução do treino
- Lista treinos da semana → aluno escolhe o do dia → **botão Iniciar**
- Cronômetro global de tempo total de treino
- Para cada exercício:
  - Mostra GIF/imagem/link, configuração do aparelho, séries × reps
  - Campo para anexar **carga utilizada** (registra histórico de evolução)
  - Botão **Iniciar descanso** → cronômetro regressivo até o tempo limite
    - Verde → amarelo → **vermelho piscando** quando ultrapassa o limite
  - Botão **Concluir exercício**
- Bloco cardio: registrar pace, velocidade, elevação ao concluir
- **Concluir treino** → resumo gamificado:
  - Tempo total, tempo por exercício, cardio realizado
  - XP ganho, streak (dias consecutivos), badges desbloqueadas
  - Comparação de carga vs treino anterior (evolução)

### Acompanhamento
- **Calendário** com dias treinados marcados (% concluído por dia, cor por intensidade)
- **Histórico** de treinos concluídos
- **Meta de dias/semana** (ex: 4x/semana) com barra de progresso
- **Evolução de carga** por exercício (gráfico de linha)
- **Contador "X dias desde início do treino"** com taxa de adesão

### Gamificação
- XP por treino concluído, bônus por streak
- Badges: "Primeira semana completa", "30 dias", "Aumentou carga 3x seguidas", etc.
- Nível visual (barra de progresso)

## 5. Visão Coach / Profissional

- Na ficha do aluno, nova aba **"Acompanhamento de Treino"** com:
  - Calendário do aluno (dias treinados)
  - Histórico de treinos com tempos e cargas
  - Gráficos de evolução de carga
  - Taxa de adesão / streak atual
- Mesmo painel disponível para Profissional acompanhar seus alunos.

---

## Detalhes técnicos

### Banco de dados (novas tabelas)

```text
workout_plans        — treino criado pelo coach/profissional (nome, dia_semana, aluno_id, criado_por)
workout_exercises    — exercícios de cada plano (ordem, exercise_id, séries, reps, carga_sugerida, descanso_seg, config_aparelho, obs)
workout_sessions     — execução de um treino pelo aluno (started_at, finished_at, plan_id)
workout_session_logs — log por exercício (carga_usada, tempo_execucao, tempo_descanso, concluido)
workout_cardio_logs  — pace, velocidade, elevação por sessão
workout_achievements — badges desbloqueadas
```

Todas com RLS: aluno vê só as suas; coach/profissional vê dos seus alunos (+ master coach vê todos).

### Stack
- TanStack Router (novas rotas), createServerFn para CRUD
- Recharts para gráficos de evolução
- date-fns para cálculo de streaks/calendário
- Framer-motion para animações gamificadas (XP, badges)

---

## Sugestão de entrega

Como é grande, sugiro entregar **em 2 etapas**:

**Etapa 1 (agora):**
- Cálculo automático de água
- Renomeações (biblioteca → criar exercícios)
- Ficha do aluno mostrando restrições/observação
- Editar exercícios prontos na biblioteca
- Schema do banco + Configuração de Treino (coach/profissional cria treinos)

**Etapa 2 (próxima mensagem):**
- Painel "Meu Treino" do aluno completo (execução + gamificação)
- Calendário, histórico, gráficos de evolução
- Visão de acompanhamento para coach/profissional

Posso seguir assim, ou prefere tudo de uma vez (vai gerar uma resposta bem grande e mais propensa a bugs)?
