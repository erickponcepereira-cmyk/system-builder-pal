# Plano: Configuração completa do Perfil do Aluno

Vou agrupar o trabalho em blocos lógicos. Algumas partes precisam de confirmação antes de eu começar.

## 1. Checkout e Indicação (paridade com Coach)

- Replicar fluxo de checkout do Coach na Loja do Aluno (Mercado Pago, mesmas opções de PIX/Cartão usadas no painel admin).
- Corrigir link de indicação `/r/:code`:
  - Hoje gera código por aluno, mas o registro nem sempre herda o coach do indicador.
  - Ajuste: ao acessar `/r/{code}`, redirecionar direto para `/register` com o `coach_id` do aluno indicador pré-vinculado e o `referred_by_student_id` salvo.
  - Quando o indicado comprar um produto (challenge), a função `process_paid_transaction` já paga comissão de indicação — vou validar que o slot `referral_student` está nos produtos padrão e ajustar se faltar.

## 2. Home do Aluno

- Saudação dinâmica: "Bom dia / Boa tarde / Boa noite, {nome}" baseada em `new Date().getHours()` (00-11 / 12-17 / 18-23). Fallback: "Seja bem-vindo, {nome}".
- **Ações rápidas**: remover Loja, Cursos, Gratuitos, Refeição, IA, Ajuda. Manter Foto, Pesagem; adicionar **Protocolo**.

## 3. Foto (IA de refeição)

- Marcar como "Em breve" — botão desabilitado com badge.

## 4. Perfil do Aluno → Carteirinha

- Nova seção "Minha Carteirinha":
  - Card com foto, nome, código de aluno, plano ativo, coach.
  - **QR Code fixo** (gerado a partir do `student.id`, sempre o mesmo).
  - Quando qualquer pessoa autenticada escaneia esse QR, abre rota `/checkin/:studentId` que registra presença no desafio do aluno e vincula quem leu (`scanned_by_profile_id`).
- Servirá também como identificação para benefícios gratuitos (será usado depois pelos parceiros).

**Backend necessário:**
- Tabela `student_checkin_scans` (id, student_id, scanned_by_profile_id, scanned_at).
- Server function `register_checkin_via_qr(student_id)` que chama `student_check_in` no contexto do aluno escaneado e registra o scan.

## 5. Ficha de Protocolo (nova)

Nova rota `/student/protocol` acessada pelo card "Protocolo":

- **Dados clínicos** (editáveis pelo aluno/coach): tipo sanguíneo, alergias, cirurgias, restrições físicas, condições (cardiopata, diabético, etc.), medicações em uso.
- **Protocolo atual** (preenchido pelo Coach — UI somente leitura para o aluno):
  - Dieta atribuída
  - Exercícios atribuídos
  - Meta de calorias/dia
  - Meta de água/dia
- **Atalhos**: botões para Anamnese, Resultado da Bioimpedância, Fichas profissionais (nutricionista, médico).

**Backend necessário:**
- Tabela `student_health_profile` (1:1 com student): tipo_sanguineo, alergias[], cirurgias, restricoes, condicoes, medicacoes.
- Tabela `student_protocols` (criada pelo coach posteriormente): student_id, coach_id, diet_plan, exercise_plan, daily_calories, daily_water_ml, active, dates.
- Tabela `student_professional_records`: student_id, professional_profile_id, type (nutritionist/doctor/...), document_url, notes.

A criação pelo Coach virá em iteração futura — agora deixo a estrutura e a tela do aluno lendo o que existir.

## 6. Desafio — Ranking por categoria

- Substituir categorias atuais por: **Gordura**, **Músculo**, **Peso**.
- Ordenar pelos campos da última `coach_body_assessments` (body_fat ↓, skeletal_muscle ↓, weight perda %).

## 7. Grupo do Aluno (real)

- Hoje é mock. Tornar real:
  - Listar membros: todos os alunos + coaches ativos do mesmo `group_id` (ou da rede do coach do aluno).
  - Mensagens reais via tabela `group_messages` já existente (vou verificar; criar se faltar).
  - Realtime via `supabase.channel`.

## 8. Loja — Categorias

- Bug: filtros mostram categorias hardcoded.
- Carregar categorias apenas da tabela `store_categories` (ou equivalente) + opção fixa "Todos".

---

## Perguntas antes de começar

Como isso é grande, prefiro entregar em fases pra você validar cada uma. Sugestão de ordem:

**Fase 1** (UI rápida, sem backend novo): saudação dinâmica, ações rápidas, foto "em breve", ranking por categoria, loja só com categorias do admin.

**Fase 2** (backend + UI): carteirinha com QR + check-in por scan, ficha de protocolo (estrutura), correção do link de indicação.

**Fase 3**: checkout do aluno (paridade com coach), grupo real com realtime.

Confirma se posso seguir nessa ordem? Ou prefere que eu faça tudo de uma vez (vai ser uma resposta longa e mais difícil de revisar)?
