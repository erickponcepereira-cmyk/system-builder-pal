## Objetivo

Três mudanças, todas na lógica de comissionamento do Master Coach e simulação financeira:

1. **Comissão de venda cruzada do Master Coach** — quando um coach com o badge `master_coach` vende para cliente de outro coach.
2. **Acesso ampliado de clientes na loja** — Master Coach pode pesquisar e vender para qualquer aluno do app.
3. **Simulador de venda direta vs aluno→aluno** na aba financeira do produto.

---

### 1. Comissão cruzada do Master Coach (todos os produtos)

**Regra**
- Quando o vendedor é Master Coach **E** o cliente pertence a outro coach:
  - Calcular a comissão do coach normalmente (`commission_coach %` do bruto, já descontadas taxas/impostos conforme regra existente).
  - Master Coach fica com **10% dessa comissão**.
  - O coach do cliente (titular do aluno) recebe os **90% restantes**, no lugar do vendedor.
- Quando o cliente é do próprio Master Coach → comissionamento normal (Master = vendedor = titular).
- Vale para todos os produtos (challenges, items, store, professional_products), **sem depender de `allow_master_coach_sale`** quando o vendedor é Master Coach.

**Implementação backend (`src/lib/coach-sales.functions.ts` + nova migração)**
- Adicionar helper `is_master_coach(_coach_id uuid)` (SQL) que retorna `true` se existe badge `master_coach` ativo.
- Reescrever o bloco `Master Coach cross-sale` em `coach-sales.functions.ts` (linhas 178–224):
  - Detectar se `coachId` é Master Coach.
  - Obter o `coach_id` titular do aluno comprador (`students.coach_id`).
  - Se `seller != titular`:
    - Para cada item, calcular `baseCommission` (mantém regra atual).
    - `masterAmount = baseCommission * 0.10`
    - `titularAmount = baseCommission * 0.90`
    - Registrar em `master_coach_commissions` (já existe) com `master_coach_id = seller`, `is_cross_sale = true`.
    - Criar/atualizar linha de comissão direcionando o restante (`titularAmount`) ao coach titular em vez do vendedor (ajuste em `commissions` ou via override no fluxo de pagamento já existente — usar a mesma trigger SQL que processa comissões: passar `beneficiary_coach_id = titular` quando `is_cross_sale = true`).
- Manter o `allow_master_coach_sale` apenas como flag legada (pode ser ignorada quando vendedor é Master Coach).

**Checkout fora do coach (compra pelo próprio aluno via link `/r/{code}`)**
- Não se aplica: aluno→aluno é regra separada. Cruzamento Master só ocorre em vendas iniciadas pelo coach Master.

---

### 2. Loja: filtro "Meus clientes" / "Todos os clientes" para Master Coach

**Em `src/components/student/StorePage.tsx` (modo `coachMode`)**
- Adicionar checagem `isMasterCoach` (consulta `coach_badges` por `master_coach`).
- Em `loadCoachData`:
  - Chamar `list_coach_team_clients` (atual) para "Meus clientes".
  - Se `isMasterCoach`, também carregar/expor opção de buscar em **todos os alunos** via nova RPC `list_all_students_for_master(_q text)` (admin-style, retorna `id, name, email, cpf, phone, coach_name`).
- No `ClientPickerModal`: quando `isMasterCoach`, mostrar abas **Meus clientes** | **Todos os clientes** com campo de busca (nome ou CPF). Coaches normais continuam vendo apenas seus alunos (sem abas).

**Backend (nova migração)**
- Criar RPC `list_all_students_for_master(_q text)`:
  - `SECURITY DEFINER`, valida se `auth.uid()` é Master Coach.
  - Retorna alunos filtrando por nome/CPF (`ILIKE`), limit 50.

---

### 3. Simulador "Venda direta" vs "Venda aluno→aluno" no editor financeiro

**Em `src/components/admin/ProductFinancialEditor.tsx`**
- Acima do bloco "Distribuição da venda normal" (linha ~230), adicionar toggle:
  - `[ Venda direta ] [ Venda aluno → aluno ]`
- Estado `simMode: "direct" | "referral"`.
- Quando `simMode = "referral"`:
  - Filtrar `sortedSlots` para considerar apenas slots com `applies_to_student_referral = true` (já existe).
  - Recalcular `dist` e o fluxo de distribuição usando os slots dessa cesta.
- Quando `simMode = "direct"`:
  - Considerar slots com `applies_to_referral_sales = true` (campo "Venda normal").
- O bloco "Comissão do coach vendedor por forma de pagamento" também passa a refletir o modo selecionado.
- Apenas simulação visual — não altera dados salvos.

---

### Arquivos afetados

- `src/lib/coach-sales.functions.ts` — nova lógica de divisão Master/titular.
- `src/components/student/StorePage.tsx` — detectar Master, abas de clientes, busca por CPF/nome.
- `src/components/admin/ProductFinancialEditor.tsx` — toggle e recálculo do simulador.
- Nova migração SQL — função `is_master_coach`, RPC `list_all_students_for_master`, ajuste no fluxo de comissão para roteamento ao coach titular em cross-sale.

### Pontos a confirmar

1. Em **vendas cruzadas**, o coach titular recebe a comissão dele (90%) imediatamente ou só na entrega/aprovação (mesma regra dos slots `is_blocked_until_delivery`)? Assumindo **mesma regra dos slots atuais**.
2. O filtro "Todos os clientes" do Master Coach deve incluir alunos **sem coach** também? Assumindo **sim** (todos os students ativos).
3. O simulador deve mostrar os dois modos lado a lado ou apenas alternar? Assumindo **alternar** (mais compacto, cabe no layout atual).