
# Plano: paridade Parceiro↔Profissional + Master Coach + Agenda

## 1) Paridade de abas Parceiro ↔ Profissional

### a) Colaboradores em Profissional
- Reaproveitar o componente que já é usado em Parceiro (`PartnerCollaborators` / aba "Colaboradores") e renderizar dentro do `ProfessionalShell`.
- Schema: criar tabela `professional_collaborators` espelhando `partner_collaborators`
  - colunas: `id`, `professional_id` (FK coach), `user_id`, `name`, `email`, `role` (`manager` | `staff`), `is_active`, `created_at`.
  - RLS: profissional dono CRUD; colaborador lê linhas onde `user_id = auth.uid()`.
  - Função `is_professional_collaborator(_user_id uuid, _professional_id uuid)` (security definer) para reaproveitar em policies que hoje só liberam o dono.
- Componente: extrair lógica comum em `CollaboratorsPanel` (props: `ownerId`, `tableName`, `ownerColumn`) e usar nas duas abas.

### b) Rede de Parceiro = Rede de Profissional
- Hoje a Rede do Parceiro está num formato antigo. Vamos:
  - Remover/aposentar a UI antiga de rede em `partner.tsx`.
  - Reaproveitar o componente de Rede usado em `professional.tsx` (mesma árvore L1/L2/L3, mesmas métricas, mesmo filtro por data).
  - Origem dos dados: reaproveitar `coach-network.functions.ts` filtrando pelo `coach_id` vinculado ao parceiro (toda venda de parceiro já passa pelo coach que aprovou — o parceiro vê a rede do "coach âncora" do parceiro).

### c) Carteira em Parceiro
- Criar aba "Carteira" no `partner.tsx` igual à `WalletTab` do profissional:
  - saldo disponível / a liberar / total recebido,
  - lista de movimentações (créditos por venda, débitos por saque),
  - botão "Solicitar saque" gerando linha em `wallet_withdrawals`.
- Reusar `WalletTab` extraindo em `components/shared/WalletPanel.tsx` (prop `ownerKind: "partner" | "professional"`).
- Schema: `partner_wallet_ledger` espelhando `professional_wallet_ledger` (mesmas colunas) + reusar `wallet_withdrawals` com coluna `owner_kind`.

## 2) Master Coach automático para Profissional

- Hoje "master coach" é um patente atingido por critério de carreira.
- Mudança: profissional aprovado entra como master coach automaticamente.
- Implementação:
  - Função `is_master_coach(_coach_id uuid)` agora retorna `true` se coach é profissional aprovado **OU** já cumpre critério de carreira.
  - Hook de comissão (RPC `compute_commissions` / motor em `financialEngine.ts`):
    - Quando o profissional vende **produto de outro profissional**, e o comprador (aluno) **não está na downline L1 direta** do vendedor → vendedor recebe **10%** do líquido como bônus "Master Coach Cross".
    - Esse bônus é em adição às comissões padrão (rede do coach âncora do aluno permanece).
  - Persistir esse split como linha extra no ledger com `kind = 'master_coach_cross_bonus'`.
  - Refletir na breakdown do `ProductReviewModal` (admin) e no `ProductDetailModal` (coach view) quando aplicável.

## 3) Agenda compartilhada do Profissional (serviços agendáveis)

### Schema
- `professional_availability`
  - `id`, `professional_id`, `weekday` (0–6), `start_time`, `end_time`, `slot_minutes` (default 30), `is_active`.
- `professional_products` — adicionar:
  - `is_schedulable boolean default false`,
  - `default_duration_minutes int`,
  - `cancellation_window_hours int default 24`.
- `professional_appointments`
  - `id`, `professional_id`, `product_id`, `seller_coach_id` (quem vendeu — pode ser o próprio), `student_id`, `order_id` (FK para `partner_product_orders`), `starts_at`, `ends_at`, `status` (`scheduled` | `cancelled` | `completed` | `no_show`), `cancelled_at`, `cancelled_by`, timestamps.
- Trigger: bloqueia cancelamento se `now() > starts_at - cancellation_window_hours`.

### Fluxo de venda
1. Vendedor (qualquer coach/profissional) abre o produto agendável.
2. Modal mostra `AvailabilityPicker` (calendário com slots livres calculados a partir de `professional_availability` − `professional_appointments` futuros).
3. Vendedor escolhe slot + identifica aluno → cria pedido (`create_partner_product_order` já existente) + linha em `professional_appointments` em transação única (nova RPC `create_scheduled_professional_order`).
4. Aparece no calendário do aluno (`student.calendar`) e em "Atendimentos" do profissional dono do serviço (nova aba `ProfessionalAppointmentsTab`).

### UI nova
- `ProfessionalAvailabilityEditor` (na aba "Configurações" do profissional): grid semanal para marcar dias/horários e slot padrão.
- Toggle "Produto agendável" no editor de `professional_products` + campo "Duração (min)".
- `AvailabilityPicker` reutilizável (calendário próximo 30 dias + grade de horários do dia escolhido).
- `ProfessionalAppointmentsTab` listando próximas/passadas + botão cancelar (respeita janela 24h).
- Card no `student.calendar` mostrando consultas marcadas, com botão "Cancelar" (também respeita janela).

## 4) Ordem de entrega
1. Migrations (collaborators, wallet ledger, availability, appointments, schedulable flags) + RLS + GRANTs + função `is_master_coach` atualizada.
2. Componente `CollaboratorsPanel` extraído + usado em Parceiro e Profissional.
3. `WalletPanel` extraído + usado em Parceiro e Profissional.
4. Rede do Parceiro substituída pelo componente do Profissional.
5. Motor de comissão atualizado + linha "master coach cross" no breakdown.
6. Agenda: editor → picker → RPC de venda agendada → abas de listagem.

## Notas técnicas
- Todas as RPCs novas serão `security definer` com `set search_path = public` e validação explícita do papel.
- `professional_appointments` ganha `ALTER PUBLICATION supabase_realtime ADD TABLE` para refletir cancelamentos em tempo real nos calendários.
- Nada de Edge Functions — toda lógica nova vai em `createServerFn` / RPCs Postgres.
