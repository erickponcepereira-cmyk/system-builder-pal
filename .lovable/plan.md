
## Escopo

Três novas capacidades para parceiros e profissionais, todas dependentes de migrations novas mais UI nas rotas `professional.tsx` e `partner.tsx`.

---

### 1) Compromissos manuais na agenda (vendas fora da plataforma)

**Migration** — nova tabela `external_appointments`:
- `id`, `owner_type` ('partner'|'professional'), `owner_id` (partner.id ou coach.id), `product_name`, `client_name`, `client_whatsapp`, `starts_at`, `ends_at`, `notes`, `created_at`.
- RLS: dono vê/edita só os seus. GRANT authenticated + service_role.

**Lógica de bloqueio**:
- Ao criar novo agendamento interno (`professional_appointments` / `partner_product_orders` com slot), a checagem de disponibilidade passa a considerar overlaps com `external_appointments` do mesmo owner.
- Ao criar external, checa overlap contra internos + externos existentes → erro se conflito.

**UI**:
- Botão "Bloquear horário externo" na aba Agenda de parceiro e profissional.
- Modal com nome do produto, nome do cliente, WhatsApp (máscara), data/hora início, data/hora fim.
- Lista dos externos ao lado dos internos no calendário, com badge "Externo" e opção de excluir/editar.

---

### 2) Compartilhamento de agenda (somente leitura)

**Migration** — nova tabela `calendar_shares`:
- `id`, `owner_type`, `owner_id`, `share_code` (text unique, 8 chars alfanuméricos gerados no insert), `viewer_type`, `viewer_id` (nullable até aceite), `status` ('pending'|'accepted'|'revoked'), `created_at`, `accepted_at`.
- RLS: owner vê/edita as próprias linhas; viewer vê onde `viewer_id = seu id AND status='accepted'`.

**Fluxo**:
- Owner gera um `share_code` na aba "Compartilhamento" (botão "Gerar código").
- Outro parceiro/profissional cola o código em "Solicitações" → cria linha com `viewer_id` preenchido e `status='pending'`; owner aceita/rejeita na aba "Solicitações" dele.
- Após aceite, viewer ganha nova aba "Agendas compartilhadas" com read-only dos compromissos (internos + externos) do owner.

**UI**:
- Nova sub-aba "Compartilhar" dentro da agenda: mostra código atual + lista de quem já tem acesso (com botão revogar).
- Nova aba "Solicitações" no menu principal do parceiro/profissional consolidando:
  - Pedidos de compartilhamento de agenda pendentes.
  - Convites de co-produção pendentes (ver item 3).

---

### 3) Co-produção de produtos com split em R$ fixo

**Migration** — nova tabela `product_coproductions`:
- `id`, `product_type` ('partner'|'professional'), `product_id`, `collaborator_type` ('partner'|'professional'), `collaborator_id`, `fixed_amount_brl` (numeric), `share_code` (código do colaborador usado no convite), `status` ('pending'|'accepted'|'rejected'), `created_at`, `responded_at`.
- Também: `share_codes` por parceiro/profissional (nova tabela `entity_share_codes` com owner_type/id/code único) usada tanto para calendário quanto para co-produção — código permanente do entity, não gerado por convite.
- Alteração em `partner_products` e `professional_products`: adicionar coluna `is_ready_for_sale` boolean default true. Migration marca `false` sempre que houver co-produção pendente (via trigger).

**Regras**:
- Ao criar/editar produto, criador digita o share_code do colaborador + valor R$. Valida que soma dos fixos ≤ preço líquido do criador (bloqueia salvar acima disso).
- Produto fica com `status='pending_coproduction'` (ou `is_ready_for_sale=false`) enquanto qualquer coprodução estiver pending → não aparece na loja para alunos.
- Se todos aceitam → produto libera. Se um rejeita → produto volta para o criador editar (remover ou substituir colaborador).

**Calculadora** (`partnerFinance.ts`):
- Nova função `computeWithCoProduction(base, coproductions[])` que subtrai o total fixo do `partnerNet` (ou `coachNet` se profissional) e retorna breakdown por colaborador.
- UI da calculadora mostra linha "Co-produção" com cada colaborador e seu valor fixo.

**Repasse financeiro** — no momento da venda:
- Após computar cascata normal, para cada coprodução accepted:
  - Debita `fixed_amount_brl` do líquido do criador.
  - Credita na carteira do colaborador (`partner_wallets` ou `professional_wallets`).
  - Registra em `transactions` com tipo `coproduction_split`.

**UI**:
- No editor de produto (parceiro e profissional): seção "Co-produção" com input de share_code + valor + botão adicionar; lista de coprodutores com status (pending/accepted/rejected) e botão remover.
- Aba "Solicitações" mostra convites de co-produção com nome do produto, criador, valor oferecido, botões aceitar/rejeitar.

---

## Arquivos afetados

**Migrations (nova):**
- `entity_share_codes` (código permanente por parceiro/profissional).
- `external_appointments`.
- `calendar_shares`.
- `product_coproductions` + colunas em `partner_products`/`professional_products`.
- Trigger para gerar share_code automático quando parceiro/profissional é criado.

**Server functions (novas):**
- `src/lib/external-appointments.functions.ts` — CRUD + checagem de conflito reutilizável.
- `src/lib/calendar-sharing.functions.ts` — gerar código (reusa entity_share_codes), solicitar, aceitar, listar shared calendars.
- `src/lib/coproduction.functions.ts` — adicionar convite, aceitar/rejeitar, listar pendentes, executar split na venda.
- Ajuste em `src/lib/partner-orders.functions.ts` e `src/lib/professional-appointments.functions.ts` para consultar `external_appointments` na checagem de slot livre e executar split de coprodução ao finalizar venda.

**UI:**
- `src/routes/_authenticated/partner.tsx` — nova sub-aba de agenda externa, sub-aba compartilhar, aba solicitações, seção coprodução no editor de produto.
- `src/routes/_authenticated/professional.tsx` — mesmas mudanças (espelhadas).
- `src/components/professional/ProfessionalProductsPanel.tsx` — seção co-produção + calculadora atualizada.
- `src/lib/partnerFinance.ts` — função de split com co-produção.
- Novo componente compartilhado `src/components/shared/ExternalAppointmentModal.tsx`.
- Novo componente `src/components/shared/RequestsInbox.tsx` (agrega calendar shares + coproductions).

---

## Ordem de execução

1. Migration 1: `entity_share_codes` + trigger de auto-geração + backfill dos existentes.
2. Migration 2: `external_appointments` + RLS/grants.
3. Migration 3: `calendar_shares` + RLS/grants.
4. Migration 4: `product_coproductions` + colunas nos produtos + trigger de status.
5. Server functions das três features.
6. UI parceiro (aba agenda externa, compartilhar, solicitações, coprodução no produto).
7. UI profissional (mesmas alterações).
8. Atualizar calculadora e integrar split no fluxo de venda.
9. `tsgo` para validar tipos.

## Fora de escopo

- Compartilhamento com escrita/edição colaborativa (usuário escolheu somente leitura).
- Split percentual ou sobre bruto (usuário escolheu valor fixo).
- Expiração automática de convites de coprodução (produto fica pendente indefinidamente até aceite).
- Notificações WhatsApp automáticas dos compromissos externos.

Posso seguir para implementação?
