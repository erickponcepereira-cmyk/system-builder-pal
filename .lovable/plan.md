# Convites de co-produção: acesso confirmado + badge de pendência

## (a) Aba Colaboração no painel do Profissional
Verificado: já existe.
- `src/routes/_authenticated/professional.tsx` já monta a tab `collab` → `Colaboração` (linhas 90 e 278) renderizando `<CollabWorkspace ownerType="professional" ownerId={info.coachId} />`.
- `src/routes/_authenticated/partner.tsx` idem (linhas 203 e 256).
- Portanto a Luana já tem a aba **Colaboração → Solicitações** disponível. Nenhuma alteração estrutural necessária — só garantir que o convite chegue visível.

Ação em (a): apenas documentar no painel um pequeno texto de ajuda vazio ("Nenhum convite") — já existe. Nada a codar.

## (b) Notificação/badge de convites pendentes

Objetivo: quando existir convite de co-produção (ou pedido de compartilhamento de agenda) com status `pending` para o usuário, mostrar contador vermelho:
1. Na aba **Colaboração** (badge ao lado do rótulo do tab, nos dois painéis).
2. Dentro do `CollabWorkspace`, no botão **Solicitações**.
3. Disparar uma `notifications` row (sino global) no momento em que o convite é criado, para aparecer no ícone de notificações que já existe no header.

### Implementação

1. **Novo server fn** `getCollabPendingCounts` em `src/lib/collab.functions.ts`
   - Input: `{ entityType: OwnerType, entityId: string }`.
   - Retorna `{ coproductions: number, calendarShares: number, total: number }`.
   - Reusa as queries já existentes de `listCoproductions` (asCollab pending) e `listCalendarShares` (incoming pending); só faz `count`.

2. **Hook leve** `useCollabPendingCount(ownerType, ownerId)` em `src/lib/collab.functions.ts` (ou arquivo novo `src/hooks/useCollabPending.ts`)
   - `useQuery` com `queryKey: ["collab-pending", ownerType, ownerId]`, `refetchInterval: 60_000`, `staleTime: 30_000`.

3. **Badge no tab**
   - `src/routes/_authenticated/professional.tsx` e `partner.tsx`: ao renderizar o botão do tab `collab`, se `total > 0`, mostrar bolinha vermelha com número (estilo Tailwind já usado no projeto — reaproveitar padrão de badge dos outros lugares).

4. **Badge dentro do CollabWorkspace**
   - `src/components/shared/CollabWorkspace.tsx`: nos botões de seção (`requests`), anexar contador. Já existe cálculo local em `RequestsPanel` (`pendingShares.length` / `pendingCoprod.length`) — expor via prop/callback para o header do CollabWorkspace mostrar o total no botão "Solicitações".

5. **Notificação no sino (persistente)**
   - Em `src/lib/collab.functions.ts`, dentro de `createCoproduction` (ou equivalente que insere em `product_coproductions` com status `pending`): após inserir, chamar `notifyProfile(collaboratorProfileId, "coproduction_invite", "Novo convite de co-produção", "Você foi convidado para uma co-produção. Toque para revisar.", "/professional?tab=collab")` (helper existe em `src/lib/admin-network.server.ts` — mover/reusar equivalente client-safe já usado noutros server fns).
   - Idem para `requestCalendarShare` → `notifyProfile(ownerProfileId, "calendar_share_request", ...)`.
   - Como as tabelas `notifications` já alimentam o sino do header, o usuário vê imediatamente sem precisar entrar na aba.

### Não-mudanças
- Nada nos schemas de banco.
- Nada nas regras de RLS.
- Não altera as regras SINDSCOND nem o fluxo financeiro.
- Não muda cores/estilo global — badge segue paleta laranja/vermelho do tema atual.

### Validação
- Criar convite de co-produção via Delma → Luana e conferir:
  1. Badge com "1" aparece no tab **Colaboração** do painel Profissional da Luana.
  2. Badge "1" no botão **Solicitações** dentro do CollabWorkspace.
  3. Notificação nova no sino do header apontando para `/professional?tab=collab`.
- Aceitar/rejeitar zera o contador na próxima refetch (≤60s) ou imediatamente após `invalidateQueries(["collab-pending", ...])`.
