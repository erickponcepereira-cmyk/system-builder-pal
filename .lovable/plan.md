## Problema

O painel do parceiro continua bloqueado mesmo após admin aprovar e o parceiro pagar tudo.

**Causa raiz:** o "gate" que decide se libera o painel (`PartnerOnboardingGate` + `getMyPartnerOnboarding`) só considera aprovado quando o campo `approved_at` está preenchido. No banco existem parceiros com `status = 'approved'` porém `approved_at = NULL` (ex.: Bulba Cross, Val.miranda beauty, Ana Flávia, Wellbe, etc.). Isso acontece quando:

- O registro foi criado/aprovado por um caminho que grava `status='approved'` sem gravar `approved_at`.
- O admin clicou "Aprovar" mas o registro já estava com `status='approved'` (então o botão "Aprovar" nem aparece na tela do admin — veja `admin.partners.tsx` que só mostra "Aprovar" quando `status !== 'approved'`).

Resultado: admin acha que já aprovou, parceiro pagou, mas o gate continua exibindo "aguardando aprovação".

## Correção

1. **Fonte da verdade = `status`** (com `blocked_at` NULL), não `approved_at`.
   - `getMyPartnerOnboarding` passa a devolver `approvedAt` derivado: `status === 'approved' && !blocked_at ? (approved_at || updated_at || now) : null`.
   - `PartnerOnboardingGate`: mantém a checagem via `info.approvedAt` (já refletirá a nova regra) e o canal realtime também dispara quando `status` muda para `approved`.

2. **Admin: garantir botão sempre acessível.**
   - Em `admin.partners.tsx`, mostrar o botão "Reaprovar / Liberar painel" também quando `status='approved'` porém `approved_at` NULL, para forçar a gravação do timestamp e disparar realtime/notificação.
   - `updatePartnerStatus` (já existente) e `adminApprovePartnerFinal` já gravam `approved_at`; nada muda ali.

3. **Backfill no banco (migração):**
   - `UPDATE partners SET approved_at = COALESCE(approved_at, updated_at, now()) WHERE status = 'approved' AND approved_at IS NULL AND blocked_at IS NULL;`
   - Isso destrava imediatamente todos os parceiros já aprovados que estão presos (incluindo o caso reportado — Bulba Cross).

4. **Prevenir regressão:** trigger `BEFORE UPDATE OR INSERT ON partners`:
   - Se `NEW.status = 'approved'` e `NEW.approved_at IS NULL` e `NEW.blocked_at IS NULL` → define `NEW.approved_at = now()`.
   - Se `NEW.status <> 'approved'` → mantém a lógica atual (não força limpar, mas garante que todo `approved` tenha timestamp).

5. **Notificação/realtime:** o `useEffect` do canal em `PartnerOnboardingGate` já escuta `UPDATE` na row do parceiro. Como o backfill/trigger vai alterar `approved_at`, o cliente recarrega automaticamente. Também vamos disparar o `reload()` quando `n.status === 'approved'` mesmo sem `approved_at` novo (defesa em profundidade).

## Arquivos afetados

- `supabase/migrations/<new>.sql` — backfill + trigger.
- `src/lib/partner-approvals.functions.ts` — `getMyPartnerOnboarding` deriva `approvedAt` a partir de `status`.
- `src/components/partner/PartnerOnboardingGate.tsx` — realtime reage a mudanças de `status`.
- `src/routes/_authenticated/admin.partners.tsx` — botão "Liberar painel" quando `status='approved'` sem `approved_at`.

## Validação

- Rodar o UPDATE de backfill e conferir que Bulba Cross fica com `approved_at` preenchido.
- Recarregar o preview logado como o parceiro afetado: painel deve abrir.
- Fluxo novo: criar parceiro pending → admin Aprovar → checar que `approved_at` é gravado e realtime destrava o gate sem F5.
