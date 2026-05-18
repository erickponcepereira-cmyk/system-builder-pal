## Novo papel: Profissional da Saúde (e correlatos)

Vamos criar um novo tipo de usuário "Profissional" que é, na prática, um **Coach com especialização**. Eles compartilham a árvore da rede de coaches (recebem comissões, têm upline/downline) mas ganham um painel personalizado de acordo com a área de atuação.

### 1. Modelo de dados (migration)

**Nova tabela `professional_specialties`** (catálogo editável pelo admin):
- `key` (slug: `personal_trainer`, `nutritionist`, `doctor`, `esthetician`, `lawyer`, `cardiologist`, `other`)
- `label`, `description`, `icon`
- `capabilities` jsonb: `{ can_prescribe_diet, can_prescribe_workout, can_prescribe_medication, can_issue_aesthetic_protocol, can_issue_legal_doc, ... }`
- `default_tabs` jsonb: lista das abas pré-configuradas (ex: `["students","diet","evaluations","wallet"]`)
- `requires_admin_setup` boolean (true para "outro")

**Seed inicial** das 6 áreas + "outro" + "cardiologista".

**Extensão da tabela `coaches`**:
- `specialty_key` text (FK lógica → `professional_specialties.key`)
- `is_professional` boolean (true quando especialidade ≠ coach generalista)
- `professional_council` text (CRN, CREF, CRM, OAB…)
- `council_number` text
- `serves_whole_network` boolean default true (profissional atende toda a base, não só rede direta)

**Tabela `product_professional_requirements`**:
- `product_id`, `specialty_key`, `is_required` — define quais profissionais um produto precisa.

**Tabela `transaction_professional_assignments`**:
- `transaction_id`, `specialty_key`, `assigned_coach_id`, `assignment_reason` ("upline_nearest", "direct_referral_choice", "fallback_global") — registra qual nutri/personal foi escolhido para aquela venda.

### 2. Algoritmo de seleção do profissional (função SQL)

`pick_professional_for_sale(_selling_coach_id, _specialty_key, _preferred_coach_id)`:

```text
1. Se _preferred_coach_id foi informado E é downline DIRETO do vendedor
   E tem a specialty → retorna ele
2. Sobe pela upline do vendedor (ele mesmo → upline1 → upline2 → ...)
   procurando o primeiro coach com specialty_key=X e aprovado → retorna
3. Procura nos downlines DIRETOS do vendedor (1º nível) com specialty
   → se houver vários, retorna o mais antigo (ou o que o vendedor escolheu)
4. Fallback: qualquer profissional aprovado com a specialty no sistema
   (serves_whole_network=true), priorizando menor carga atual
```

Chamada no `process_paid_transaction` para cada `product_professional_requirements`.

### 3. Cadastro e fluxo de aprovação

- Em `register?role=professional` (novo) — coleta dados básicos + **seletor de especialidade** + conselho profissional + upline (igual coach).
- `handle_new_user` cria profile com role `coach` + flag `is_professional=true`.
- Após aprovação do admin, no primeiro login, modal **"Confirme sua área de atuação"** se `specialty_key` for null.
- Se escolher "outro" → cria notificação para admin: "Profissional X precisa de configuração de painel".

### 4. Painel do profissional (`/professional`)

Reutiliza shell do coach, mas as abas renderizadas vêm de `specialty.default_tabs`:

| Specialty | Abas padrão |
|-----------|-------------|
| Personal trainer | Alunos, **Treinos**, Avaliações, Carteira, Rede |
| Nutricionista | Alunos, **Dieta/Protocolo**, Anamnese, Carteira, Rede |
| Médico/Cardiologista | Alunos, **Prescrições**, Exames, Carteira, Rede |
| Esteticista | Alunos, **Protocolo estético**, Sessões, Carteira |
| Advogado | Clientes, **Documentos**, Consultas, Carteira |
| Outro | Apenas Alunos + Carteira + Rede, com aviso "aguardando configuração" |

**Visualização de alunos**: por padrão mostra os alunos atribuídos a ele (via `transaction_professional_assignments`) com toggle "Ver toda a base" (se `serves_whole_network`).

### 5. Tela de venda (NewSaleModal)

Quando o produto tem `product_professional_requirements`:
- Para cada specialty exigida, mostra um **seletor** populado pelo algoritmo:
  - Pré-selecionado: profissional encontrado pela regra (upline mais próximo).
  - Lista alternativa: downlines diretos do vendedor com a specialty.
  - Tooltip explicando a escolha.

### 6. Admin

- Nova aba **"Profissionais"** em `/admin` listando coaches com `is_professional=true`, filtros por especialidade, status do conselho.
- Em `/admin/products` (Motor Financeiro) — campo "Profissionais necessários" (multi-select de especialidades).
- Aba **"Especialidades"** para criar/editar catálogo e configurar abas/capacidades para "outro".

### 7. Arquivos

**Migration**: `*_professional_role.sql` — tabelas + seed + função `pick_professional_for_sale` + hook no `process_paid_transaction`.

**Criados**:
- `src/routes/professional.tsx` (shell)
- `src/components/professional/SpecialtyTabs.tsx` (router de abas por specialty)
- `src/components/professional/tabs/{DietTab,WorkoutTab,PrescriptionTab,AestheticTab,LegalTab,PendingSetupTab}.tsx`
- `src/components/auth/ProfessionalRegistration.tsx`
- `src/routes/admin.professionals.tsx`
- `src/routes/admin.specialties.tsx`
- `src/lib/professional-assignment.functions.ts`

**Editados**:
- `src/server/registration.{server,functions}.ts` — aceita `role=professional`
- `src/routes/register.tsx` — botão "Sou profissional da saúde"
- `src/components/coach/NewSaleModal.tsx` — seletor de profissional
- `src/routes/admin.tsx` — links novos
- `src/components/admin/ProductFinancialEditor.tsx` — campo requirements

### Pontos para confirmar

1. **"Outro" profissional**: ao aprovar, admin escolhe manualmente quais abas liberar de uma lista, ou ele cria uma especialidade nova reutilizável? (Sugiro: cria especialidade nova reutilizável.)
2. **Comissões**: quando o profissional atende uma venda, ele recebe um **slot dedicado** no produto (`destination='professional_wallet'` no Motor Financeiro), correto? Ou continua só recebendo via rede MLM normal?
3. **Painel duplo**: o profissional também tem acesso ao painel `/coach` normal (rede/MLM/carteira) OU só ao `/professional`? Sugestão: `/professional` tem aba "Rede" que reutiliza componentes do coach, mantendo um único shell.

Posso seguir com essas premissas se você confirmar — em especial sobre comissionamento (item 2), que afeta o motor financeiro.
