## Objetivo

Trazer para o painel do profissional a mesma aba "Colaboradores" que já existe no painel do parceiro, com duas formas de vincular:

1. **Convite via QR code / link de indicação** (igual ao parceiro).
2. **Seleção manual** de um aluno já cadastrado que tenha esse profissional como coach.

Limite de 7 colaboradores e mesmos benefícios do modelo parceiro (painel de aluno liberado, desafios, produtos gratuitos enquanto o profissional estiver ativo).

## Mudanças no banco

Migration nova:

- Adicionar coluna `students.professional_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL`.
- Índice `idx_students_professional_coach_id`.
- Constraint: se `professional_coach_id` estiver preenchido, ele deve apontar para um coach com `is_professional = true` (via trigger `BEFORE INSERT/UPDATE`).
- RLS: manter policies existentes de `students`; o novo campo é lido pelas mesmas policies. Adicionar policy adicional permitindo que o profissional (dono do `professional_coach_id`) enxergue esses students (SELECT).
- Função `link_professional_collaborator(_student_id uuid)` SECURITY DEFINER que:
  - valida que o caller é o coach com `is_professional=true`,
  - valida que `students.coach_id` do aluno pertence ao mesmo profile (o profissional é coach direto do aluno),
  - valida limite de 7 colaboradores atuais do profissional,
  - grava `professional_coach_id` no student.
- Função `unlink_professional_collaborator(_student_id uuid)` simétrica.
- GRANT EXECUTE dessas duas funções para `authenticated`.

## Fluxo de convite via link (QR)

Reaproveitar o `referral_code` que o coach/profissional já possui em `coaches.referral_code`. Ao processar cadastro por `/r/:code`, se o dono do código for profissional (`is_professional = true`), já preencher `students.professional_coach_id` além do `coach_id` habitual — mantém consistência com o modelo do parceiro. Sem mudança de UX no fluxo de cadastro.

## Server functions novas (`src/lib/professional-collaborators.functions.ts`)

Todas com `.middleware([requireSupabaseAuth])`:

- `listProfessionalCollaborators()` → alunos onde `professional_coach_id = coach.id` do caller.
- `listEligibleStudents()` → alunos onde `students.coach_id` pertence ao caller (via profile) **e** ainda não são colaboradores. Serve o dropdown de seleção manual.
- `attachProfessionalCollaborator({ studentId })` → chama `link_professional_collaborator`.
- `detachProfessionalCollaborator({ studentId })` → chama `unlink_professional_collaborator`.

## UI

### `src/routes/_authenticated/professional.tsx`

- Adicionar `"collaborators"` ao `ensureTabs` e ao `TAB_META` (`Colaboradores`, ícone `Users`).
- Remover o filtro atual `t !== "collaborators"` no cálculo de `tabs`.
- Renderizar `<ProfessionalCollaboratorsPanel coachId={info.coachId} referralCode={...} name={info.name} />` quando `tab === "collaborators"`. Buscar `coaches.referral_code` no carregamento inicial.

### Novo componente `src/components/professional/ProfessionalCollaboratorsPanel.tsx`

Espelha visualmente o `CollaboratorsPanel` do parceiro, com dois blocos:

1. **Convite** — QR code do link `/r/<referral_code>`, botões Copiar / Compartilhar, contador `x / 7`, aviso quando limite for atingido.
2. **Vincular aluno existente** — botão "Vincular aluno" abre modal com busca (usando `listEligibleStudents`). Ao confirmar, chama `attachProfessionalCollaborator`.
3. **Lista "Meus colaboradores"** — cards com foto/nome/e-mail e botão remover (chama `detachProfessionalCollaborator`).

Reaproveitar estilos existentes do painel do parceiro para manter identidade visual.

## Fora de escopo

- Não mexe no painel do parceiro (só o profissional ganha a aba).
- Não altera regras de comissão, wallets ou fluxo de vendas.
- Não altera SubscriptionGuard nem cadastro público — só o `/r/:code` passa a preencher `professional_coach_id` automaticamente quando o dono do código é profissional.

## Arquivos afetados

- Nova migration SQL (coluna + trigger + policy + funções + grants).
- `src/lib/professional-collaborators.functions.ts` (novo).
- `src/components/professional/ProfessionalCollaboratorsPanel.tsx` (novo).
- `src/routes/_authenticated/professional.tsx` (adiciona aba + wiring).
- Ajuste no handler do cadastro por `/r/:code` para preencher `professional_coach_id` quando aplicável.
