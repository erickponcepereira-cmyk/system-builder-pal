
# Painel Profissional — Reorganização ampla

Pedido grande, vou dividir em blocos para podermos validar antes de mexer.

## 1. Anamnese unificada (coach ↔ profissional ↔ aluno)
- Hoje existem fluxos separados de anamnese no coach (`ProtocolTab` / `EvaluateTab` / `StudentDetailsModal`) e no profissional (`AnamneseTab`). Vou eleger **um único schema/tabela** de anamnese (o do profissional, que já permite customizar perguntas no `SettingsTab`) como fonte da verdade.
- No painel do **coach**, em "Protocolo" e "Treino", adicionar botão "Preencher anamnese com o aluno" que abre o mesmo formulário e grava na mesma tabela.
- No painel do **aluno**, exibir as respostas (read-only) em "Minha Anamnese" / prontuário, e no histórico do aluno visível pelo coach.
- O profissional continua podendo customizar as perguntas em "Configurações"; vou validar que o salvar/carregar está funcional e corrigir se necessário.

## 2. Painel Profissional — itens diretos
- **Remover** a aba "Rede" (`network` / `NetworkTreeTab`) do menu do profissional.
- **Nutrição**: para `specialty_key = 'nutricionista'`, liberar abas `diet`, `anamnese`, `evaluate` por padrão (ajustar `default_tabs` no seed/registro da especialidade).
- Nova aba **"Visão Geral"** (dashboard) com:
  - quantidade de atendimentos (mês corrente + total)
  - quantidade de alunos/clientes ativos
  - quantidade de produtos ativos
  - card de link de indicação (mesmo do coach)
  - card de grupo WhatsApp (já existe `WhatsAppGroupCard`)
  - card "Monte sua equipe" → mensagem "Converse com seu coach para mais informações" + telefone do coach upline (WhatsApp link).
- **Atendimentos / Minha Agenda**: na lista de horários (formato igual ao print) exibir, para cada slot ocupado, nome do cliente + status de pagamento (Pago / Pendente) + nome do coach do cliente.
- **Configurações**: deixar funcionais:
  - upload de foto de perfil
  - edição de dados (nome, telefone, bio etc.)
  - **especializações como tags** (add/remover, salvas no perfil profissional e exibidas no card público).

## 3. Cadastro do profissional = mesmo fluxo do coach
Hoje o profissional é um `coaches.is_professional = true`. Vou ajustar para que o fluxo de cadastro siga o mesmo do coach:
1. Cadastro inicial → conta criada com role `student` (painel aluno já liberado).
2. Compra do curso de coach → mesmo gateway.
3. Conclusão do curso → admin libera ID → marca `approved_at`.
4. Ao aprovar: liberar simultaneamente **painel coach** e **painel profissional** (RoleSwitcher passa a mostrar os três).

Regra geral confirmada:
- Aluno: sempre liberado.
- Coach + Profissional: liberados juntos só após aprovação do curso.

## Arquivos principais a tocar
- DB: migração para
  - `default_tabs` de `professional_specialties` (nutricionista),
  - garantir colunas `specializations text[]` no `coaches` (tags),
  - tabela única `anamnesis_responses` (ou reaproveitar `professional_anamnesis_responses` renomeando vínculo p/ `student_id`).
- `src/routes/professional.tsx` — remover rede, adicionar Visão Geral, ajustar tabs nutrição.
- `src/components/professional/OverviewTab.tsx` (novo) — dashboard + equipe + indicação.
- `src/components/professional/AppointmentsTab.tsx` — incluir nome do cliente, status pagamento, nome do coach.
- `src/components/professional/SettingsTab.tsx` — foto, dados, tags de especialização.
- `src/components/professional/AnamneseTab.tsx` + `src/components/coach/tabs/ProtocolTab.tsx` / `WorkoutPlansTab.tsx` — botão "preencher anamnese" reutilizando o mesmo componente.
- `src/routes/student.medical-record.tsx` / `student.protocol.tsx` — exibir respostas unificadas.
- Fluxo cadastro: `src/components/auth/ProfessionalRegistration.tsx`, `src/lib/registration.server.ts`, painel admin de aprovação.

## Sugestão de ordem (entregas separadas)
Para não virar uma PR gigante e arriscada, sugiro fazer em 3 levas:

**Leva A (essa rodada)** — itens mais visíveis e de baixo risco:
- Remover aba Rede do profissional.
- Liberar `diet/anamnese/evaluate` para nutricionista.
- Criar aba "Visão Geral" com dashboard + indicação + WhatsApp + card "monte sua equipe".
- Agenda: nome do cliente + status pagamento + nome do coach.
- Configurações: foto, dados, tags de especialização funcionais.

**Leva B** — anamnese unificada (schema + componente compartilhado + exibição no aluno e coach).

**Leva C** — refatorar fluxo de cadastro profissional para espelhar o do coach (paga curso → aprovação → libera ambos painéis). Isso mexe em onboarding/admin e merece testes dedicados.

Confirma se posso seguir com a **Leva A** agora, ou prefere outra ordem / quer ajustar algum item?
