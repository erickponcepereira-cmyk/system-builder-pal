# Nenhum perfil de parceiro entra — causa e correção

## O que está acontecendo (confirmado no banco)

Na rodada de segurança recente, a permissão de leitura da tabela de parceiros deixou de ser "a tabela inteira" e passou a ser **coluna por coluna**. Conferi as colunas liberadas hoje: `whatsapp`, `public_whatsapp`, `address`, `document`, `referral_link`, `free_redeem_policy`, `latitude/longitude`, `zip_code` e outras **não estão liberadas** para usuários logados.

O painel do parceiro carrega exatamente essas colunas em uma única consulta. Como uma coluna bloqueada derruba a consulta inteira, o painel recebe "sem dados" e mostra **"Cadastro de parceiro não encontrado."** — para todos os parceiros, mesmo os aprovados e em dia. Não é perda de cadastro: os dados estão intactos.

Pelo mesmo motivo estão quebrados:
- Página pública/aluno de detalhe do parceiro (lê "todas as colunas").
- Aba de parceiros do admin (lê "todas as colunas").

## Correção proposta

1. **Leitura do dono pelo servidor**: criar uma função de banco protegida que devolve a ficha completa da unidade **somente** para o dono, o admin ou um membro com permissão de editar a unidade. O painel do parceiro passa a usar essa função em vez da consulta direta.
2. **Leitura pública enxuta**: a página de detalhe do parceiro (aluno/visitante) passa a pedir apenas os campos realmente públicos (nome, foto, capa, descrição, cidade/estado, área, especialidade, redes sociais e o WhatsApp público), sem tentar ler documento nem dados internos.
3. **Admin**: a lista de parceiros do admin passa a ser carregada por função de servidor com privilégio administrativo, em vez de "todas as colunas" pelo navegador.
4. **Varredura**: revisar as demais telas que leem a tabela de parceiros pelo navegador e ajustar para colunas liberadas ou para as funções acima, evitando que o mesmo bug reapareça em outro canto (carteira, freebies, membros, produtos).
5. **Verificação**: entrar com um login de parceiro real no preview e confirmar que o painel abre, troca de unidade, e que documento/dados sensíveis continuam invisíveis para quem não é dono/admin.

## Detalhes técnicos

- Migração: `create function public.parceiro_do_dono(p_partner_id uuid) returns ... security definer` com checagem `is_admin(auth.uid()) or profile_id = current_profile_id() or partner_pode(id,'profile.editar')`; `revoke execute from public/anon`, `grant execute to authenticated`.
- `src/routes/_authenticated/partner.tsx` (linha ~197): trocar o `select(...)` direto pela RPC.
- `src/routes/_authenticated/student.partners.$partnerId.tsx` (linha 60): trocar `select("*")` por lista explícita de colunas públicas.
- `src/routes/_authenticated/admin.partners.tsx` (linha 30): mover para server fn com `supabaseAdmin`.
- Sem alteração nas políticas RLS existentes e sem reabrir `document`/`whatsapp` para o público — a exposição corrigida na auditoria de segurança permanece fechada.
