# Novo perfil: Empresa Parceira (Partner)

Criar um quarto tipo de usuário no FitChain — **Partner** (empresa parceira) — que cadastra benefícios gratuitos e produtos patrocinados para alunos e coaches, com aprovação obrigatória do admin.

## Regras de negócio

1. Cadastro pela tela de registro pública com role `partner` (CPF/CNPJ, nome fantasia, foto, descrição, localização, WhatsApp, redes sociais).
2. Login direciona para `/partner` (painel próprio, mobile-first como o do coach).
3. **Regra do gratuito obrigatório:** a empresa só pode publicar produtos pagos enquanto tiver pelo menos 1 produto gratuito ativo e aprovado. Se desativar/expirar o gratuito → todos os pagos da empresa são automaticamente despublicados (trigger no banco).
4. Todo produto (gratuito ou pago) entra com status `pending` e precisa de aprovação do admin. Admin pode aprovar ou reprovar com observação que aparece para o partner corrigir.
5. Produtos aprovados:
   - Gratuitos → aparecem na aba **Gratuitos** (aluno + coach) com selo "Parceiro"
   - Pagos → aparecem na **Loja**, em categoria fixa **"Patrocinados"**
6. Cada produto exibe o perfil da empresa clicável (modal): fotos, descrição, redes sociais, WhatsApp, **timeline de posts** (galeria de fotos que a empresa publica).
7. QR Code de check-in: cada empresa tem QR fixo (`/partner-checkin/:partnerId`). Aluno escaneia → registra visita automática na `attendance_logs` (activity_type = `partner_visit`) e fica visível no perfil dele.
8. Admin pode editar todos os campos da empresa via painel Admin → nova aba **Empresas Parceiras**.

## Fases

### Fase 1 — Banco de dados (migration)
- enum `user_role` adicionar `'partner'`
- tabela `partners` (profile_id, fantasy_name, document, document_type, photo_url, description, latitude/longitude, address, city, state, whatsapp, instagram, facebook, website, status, approved_at, blocked_at)
- tabela `partner_products` (partner_id, kind 'free'|'paid', name, description, image_url, price, stock, status `pending|approved|rejected|inactive`, admin_notes, approved_at, approved_by)
- tabela `partner_posts` (partner_id, image_url, caption, created_at) — timeline
- tabela `partner_visits` (partner_id, student_id, visited_at, source) — check-ins por QR
- Trigger `enforce_partner_free_required`: ao desativar/reprovar/expirar o último produto gratuito aprovado, faz UPDATE em `partner_products` setando `status='inactive'` para todos pagos da mesma empresa.
- Função `partner_checkin(_partner_id)`: insere `partner_visits` + `attendance_logs`.
- RLS:
  - partners: owner select/update próprio, admin tudo, público select (aprovados)
  - partner_products: owner CRUD próprios, admin tudo, público select (status approved)
  - partner_posts: owner CRUD, público select (se partner aprovado)
  - partner_visits: owner select próprios, student select próprios, admin tudo

### Fase 2 — Cadastro e Auth
- `PartnerRegistration.tsx` (form com CNPJ/CPF, máscara, validação Zod)
- Adicionar opção "Sou empresa parceira" em `/register`
- `handle_new_user` trigger: criar linha em `partners` quando role = partner
- Roteamento pós-login em `/login`: se role partner → `/partner`

### Fase 3 — Painel do Parceiro (`/partner`)
- Shell mobile com abas: **Início**, **Produtos**, **Timeline**, **QR Code**, **Perfil**
- Início: stats (visitas, produtos ativos, pendentes de aprovação), alerta se faltar gratuito ativo
- Produtos: CRUD com formulário (kind, nome, descrição, imagem, preço, estoque) — bloqueia "novo pago" se não houver gratuito ativo aprovado. Mostra status e admin_notes em caso de rejeição.
- Timeline: upload de fotos com legenda, grid estilo Instagram
- QR Code: gera QR fixo apontando para `/partner-checkin/:partnerId`, botão download/print
- Perfil: editar fantasy_name, foto, descrição, endereço, WhatsApp, redes sociais

### Fase 4 — Aprovação no Admin
- Nova aba **Empresas** em AdminShell (perm key `partners`)
- Listagem com filtros (pendentes, ativas, bloqueadas), aprovar/bloquear empresa
- Sub-aba **Produtos pendentes**: lista de partner_products aguardando; aprovar ou reprovar com observação
- Edição completa de qualquer empresa (todos os campos)
- Permissão também controlada em `admin-permissions.ts`

### Fase 5 — Exposição para Aluno e Coach
- `student.freebies.tsx`: adicionar seção "Benefícios de parceiros" listando `partner_products` aprovados com kind=free; card com modal de perfil da empresa
- `student.store.tsx`: adicionar categoria fixa "Patrocinados" listando partner_products approved + kind=paid
- `coach`: aba **Gratuitos** ganha mesma seção de parceiros
- Componente `PartnerProfileModal`: exibe info da empresa, redes sociais, WhatsApp, timeline (grid), lista de outros produtos da empresa
- Rota pública `/partner-checkin/$partnerId.tsx`: aluno logado → chama `partner_checkin`, mostra confirmação visual e badge no perfil

### Fase 6 — Integração no perfil do aluno
- Em `student.profile.tsx` mostrar histórico de visitas a parceiros (últimas 10) com data e nome da empresa

## Detalhes técnicos

- Imagens via bucket `store-images` (já existe) em pasta `partners/`
- Realtime opcional para notificar partner quando produto é aprovado (usa tabela `notifications` existente)
- Timeline limitada a 30 posts por empresa para manter leveza
- Lista de produtos paginada (12 por página) em Loja e Gratuitos
- Validação Zod em todos os formulários
- Trigger de "free required" roda em `AFTER UPDATE OF status ON partner_products` para garantir consistência

## Arquivos novos

- `supabase/migrations/<timestamp>_partners.sql`
- `src/components/auth/PartnerRegistration.tsx`
- `src/routes/partner.tsx` (layout shell)
- `src/routes/partner.index.tsx`
- `src/routes/partner.products.tsx`
- `src/routes/partner.timeline.tsx`
- `src/routes/partner.qrcode.tsx`
- `src/routes/partner.profile.tsx`
- `src/routes/partner-checkin.$partnerId.tsx`
- `src/routes/admin.partners.tsx`
- `src/components/partners/PartnerProfileModal.tsx`
- `src/components/partners/PartnerProductCard.tsx`

## Arquivos editados

- `src/lib/admin-permissions.ts` (+ key `partners`)
- `src/components/admin/AdminShell.tsx` (+ aba Empresas)
- `src/routes/register.tsx` (+ opção parceira)
- `src/routes/login.tsx` (+ redirect partner)
- `src/routes/student.freebies.tsx` (+ benefícios de parceiros)
- `src/routes/student.store.tsx` (+ categoria patrocinados)
- `src/routes/student.profile.tsx` (+ histórico de visitas)
- `src/routes/coach.tsx` (aba Gratuitos com parceiros)

Confirma o plano? Começo pela Fase 1 (migration) assim que aprovar.
