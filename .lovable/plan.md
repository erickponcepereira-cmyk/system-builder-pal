## Objetivo
Transformar o painel atual da nutricionista (`/professional`) em um workspace funcional, reaproveitando o máximo possível dos componentes já existentes do Coach.

## 1. Aba "Meus Alunos"
- Adicionar botão **"+ Novo Aluno"** (estilo coach).
- Modal de cadastro pedindo: **nome, idade, telefone, altura, peso, sexo, cor da pele**.
- Ao salvar:
  - Cria `profile` (role `student`, sem auth — perfil "gerenciado pela nutri").
  - Cria `students` vinculado ao `coach_id` da nutricionista (campo `coach_id` é usado como dono do aluno aqui também, já que a tabela é a mesma).
  - Marca metadado indicando que o aluno foi criado por uma profissional (campo novo `created_by_professional_id` em `students`, via migration).
- Lista combina:
  - Alunos atribuídos via `transaction_professional_assignments` (já existente).
  - Alunos criados manualmente pela nutricionista.
- Clicar em um aluno abre o detalhe (mesmo padrão do coach: aluno selecionado dita o conteúdo das abas de Dieta/Anamnese/Avaliações).

## 2. Aba "Dieta / Protocolo"
- Reaproveitar `ProtocolTab` do coach (copiar para `src/components/professional/ProtocolTab.tsx` ajustando imports / labels).
- Funciona com o aluno selecionado em "Meus Alunos".

## 3. Aba "Anamnese"
- Reaproveitar a anamnese do coach (atualmente parte de Evaluate/Protocol — vou copiar o trecho específico).
- Perguntas vêm de uma tabela nova `professional_anamnese_questions` (por profissional). Se vazia, usa o set padrão do coach.
- CRUD das perguntas fica dentro da aba **Configurações** (item 6).

## 4. Aba "Avaliações" (FitMindShape)
- Copiar `FitMindShape.tsx` e `StudentEvaluationPanel.tsx` / `AssessmentComparison.tsx` para uso da nutri (mesma UI, mesmas tabelas `body_assessments`).
- Já funciona apontando para o aluno selecionado.

## 5. Aba "Rede"
- Trocar o `MyNetworkPanel` resumido pelo `NetworkTreeTab` (árvore completa que o coach vê).

## 6. Aba "Configurações" (nova)
Sub-seções:
- **Perfil público**: foto, bio, Instagram, outras redes sociais (array), sites, descrição "vender seu trabalho". Salvo em `profiles` + nova tabela `professional_public_profile` (instagram, website, social_links jsonb, bio_long, headline).
- **Perguntas da anamnese**: editor (adicionar/editar/remover/reordenar perguntas).
- Os dados de perfil ficam visíveis na ficha pública do nutricionista quando alguém clica num produto dele na loja (ajuste leve no `ProductDetailModal` para mostrar bloco "Sobre o profissional" com links).

## 7. Migrations necessárias
- `students.created_by_professional_id uuid null` + index.
- `professional_anamnese_questions` (id, coach_id, label, kind, options jsonb, order, is_active, timestamps) + RLS (o dono CRUD; admin lê tudo).
- `professional_public_profile` (id, profile_id unique, headline, bio_long, instagram, website, social_links jsonb, timestamps) + RLS (dono CRUD, leitura pública para profissionais aprovados).
- Policy/trigger para permitir nutricionista criar `profiles` + `students` de alunos gerenciados (sem auth.users).

## 8. Arquivos a criar/editar
**Criar**
- `src/components/professional/NewStudentModal.tsx`
- `src/components/professional/ProfessionalStudentsTab.tsx`
- `src/components/professional/ProtocolTab.tsx` (cópia adaptada)
- `src/components/professional/AnamneseTab.tsx`
- `src/components/professional/EvaluationsTab.tsx` (reusa FitMindShape)
- `src/components/professional/SettingsTab.tsx` (perfil público + perguntas anamnese)

**Editar**
- `src/routes/professional.tsx` (wire das novas abas + aluno selecionado em contexto).
- `src/components/store/ProductDetailModal.tsx` (bloco "Sobre o profissional" quando o produto pertence a uma nutri).

## Escopo fora deste plano
- Não vamos criar fluxo de convidar o aluno gerenciado a virar usuário real (pode vir depois).
- Não vamos mexer em comissões nem na fila bloqueada da nutri — já existe.

Confirma esse plano ou quer ajustar alguma parte (ex.: cor da pele em lista fixa, aluno gerenciado vs convite, etc.)?
