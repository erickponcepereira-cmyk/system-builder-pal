-- ==========================================================================
-- PROPOSTA — NAO APLICADA. Escrita pelo chat de funcionalidades.
-- Fora de supabase/migrations/ de proposito. Quem aplica: chat financeiro.
--
-- OBJETIVO: um dono com 3 academias. Ele ve as 3 num painel e transita
-- entre elas. Cada academia tem uma recepcao com permissoes que ELE define,
-- uma a uma. Produtos e carteira sao SEPARADOS por academia (decidido).
-- ==========================================================================
--
-- POR QUE ASSIM
--
-- Cada academia continua sendo uma linha em `partners`. O sistema inteiro
-- ja pensa por parceiro: partner-checkin.$partnerId, student.partners.
-- $partnerId, pedidos e produtos. Tres academias = tres linhas. Nada do
-- que existe muda de forma.
--
-- O que falta e uma camada de PERTENCIMENTO. Hoje o painel resolve o
-- parceiro assim (partner.tsx:147):
--
--   .from("partners").select("*").eq("profile_id", profile.id).maybeSingle()
--
-- Um perfil para um parceiro. Se o dono virar profile_id das 3, o
-- maybeSingle() ESTOURA ao achar mais de uma linha. Por isso a tabela nova.
--
-- `partners.profile_id` NAO sai. Continua sendo o responsavel legal e
-- segue usado por outras telas. A tabela abaixo e aditiva.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- PARTE 1 — a tabela de pertencimento
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.partner_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  papel       text NOT NULL DEFAULT 'staff'
              CHECK (papel IN ('owner','manager','staff')),
  -- allowlist explicita. Vazio = nao pode nada alem do que o papel owner da.
  permissoes  text[] NOT NULL DEFAULT '{}',
  criado_em   timestamptz NOT NULL DEFAULT now(),
  criado_por  uuid REFERENCES public.profiles(id),
  UNIQUE (partner_id, profile_id)
);

CREATE INDEX IF NOT EXISTS partner_members_profile_idx
  ON public.partner_members (profile_id);
CREATE INDEX IF NOT EXISTS partner_members_partner_idx
  ON public.partner_members (partner_id);

ALTER TABLE public.partner_members ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------------------------
-- CATALOGO DE PERMISSOES — extraido das abas reais de partner.tsx:201
-- --------------------------------------------------------------------------
-- Nomes exatos que o front vai enviar. Nao inventar outros sem alinhar.
--
--   overview.ver          Inicio  (contagem de visitantes)
--   scanner.usar          Scanner (leitor de QR / check-in)   <- recepcao
--   qrcode.ver            QR do estabelecimento
--   timeline.ver          Timeline
--   timeline.editar
--   products.ver          Produtos
--   products.editar                                           <- bloquear
--   freebies.ver          Gratuitos
--   freebies.editar
--   store.ver             Loja
--   store.editar
--   network.ver           Rede
--   wallet.ver            Carteira                            <- bloquear
--   subscription.ver      Mensalidade
--   annual.ver            Anuidade
--   reports.ver           Relatorios
--   calendar.ver          Agenda
--   calendar.editar
--   collaborators.ver     Colaboradores
--   collaborators.editar
--   collab.ver            Colaboracao
--   profile.ver           Perfil
--   profile.editar
--   members.gerenciar     Convidar/remover membros e mexer nas permissoes
--
-- `owner` ignora a lista e pode tudo — ver a funcao da Parte 3.


-- --------------------------------------------------------------------------
-- PARTE 2 — backfill: e ISTO que garante que nada quebra
-- --------------------------------------------------------------------------
-- Todo parceiro que ja existe ganha uma linha de dono. Depois disso, cada
-- um enxerga exatamente uma unidade com todas as abas — identico a hoje.
-- A mudanca so aparece para quem tiver mais de uma linha.

INSERT INTO public.partner_members (partner_id, profile_id, papel, permissoes)
SELECT p.id, p.profile_id, 'owner', '{}'
  FROM public.partners p
 WHERE p.profile_id IS NOT NULL
ON CONFLICT (partner_id, profile_id) DO NOTHING;


-- --------------------------------------------------------------------------
-- PARTE 3 — a funcao que a RLS vai usar
-- --------------------------------------------------------------------------
-- SECURITY DEFINER para nao depender de o chamador conseguir ler
-- partner_members. STABLE porque e consultada muitas vezes por query.

CREATE OR REPLACE FUNCTION public.partner_pode(_partner_id uuid, _permissao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.partner_members m
      JOIN public.profiles pr ON pr.id = m.profile_id
     WHERE m.partner_id = _partner_id
       AND pr.user_id = auth.uid()
       AND (m.papel = 'owner' OR _permissao = ANY(m.permissoes))
  );
$$;

REVOKE ALL ON FUNCTION public.partner_pode(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_pode(uuid, text) TO authenticated;

-- Lista as unidades da pessoa logada — alimenta o seletor de unidade.
CREATE OR REPLACE FUNCTION public.minhas_unidades_parceiro()
RETURNS TABLE (
  partner_id   uuid,
  fantasy_name text,
  city         text,
  state         text,
  photo_url    text,
  papel        text,
  permissoes   text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.fantasy_name, p.city, p.state, p.photo_url,
         m.papel, m.permissoes
    FROM public.partner_members m
    JOIN public.partners p  ON p.id = m.partner_id
    JOIN public.profiles pr ON pr.id = m.profile_id
   WHERE pr.user_id = auth.uid()
   ORDER BY p.fantasy_name;
$$;

REVOKE ALL ON FUNCTION public.minhas_unidades_parceiro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_unidades_parceiro() TO authenticated;


-- --------------------------------------------------------------------------
-- PARTE 4 — RLS de partner_members
-- --------------------------------------------------------------------------

CREATE POLICY pm_ler_do_proprio_parceiro ON public.partner_members
  FOR SELECT TO authenticated
  USING (public.partner_pode(partner_id, 'members.gerenciar')
         OR profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY pm_gerenciar ON public.partner_members
  FOR ALL TO authenticated
  USING (public.partner_pode(partner_id, 'members.gerenciar'))
  WITH CHECK (public.partner_pode(partner_id, 'members.gerenciar'));

CREATE POLICY pm_admin ON public.partner_members
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));


-- --------------------------------------------------------------------------
-- PARTE 5 — O PONTO QUE NAO PODE SER PULADO
-- --------------------------------------------------------------------------
-- Esconder aba em React e COSMETICO. Se a recepcao tiver sessao valida,
-- ela continua conseguindo dar UPDATE em partner_products ou ler a
-- carteira pela API REST, mesmo sem enxergar o botao.
--
-- Acabamos de viver isso com `products`: a loja nao exibia custo, mas a
-- API entregava. Se aqui so fizermos a camada visual, o resultado e uma
-- recepcionista com acesso tecnico a carteira e ao catalogo.
--
-- Exemplo do padrao, em partner_products:

-- DROP POLICY IF EXISTS <policy_de_escrita_atual> ON public.partner_products;
-- CREATE POLICY pp_escrita_por_permissao ON public.partner_products
--   FOR ALL TO authenticated
--   USING       (public.partner_pode(partner_id, 'products.editar'))
--   WITH CHECK  (public.partner_pode(partner_id, 'products.editar'));

-- TABELAS QUE PRECISAM DO MESMO TRATAMENTO — confirmar a lista, eu nao
-- auditei todas:
--   partner_products          -> products.editar
--   partner_freebie_*         -> freebies.editar
--   as tabelas da carteira do parceiro -> wallet.ver
--   pedidos do parceiro       -> leitura por unidade
--
-- REGRA GERAL: onde hoje a policy compara com
-- `partners.profile_id = perfil_do_usuario`, trocar por
-- `public.partner_pode(partner_id, '<permissao>')`. Isso preserva o
-- comportamento do dono (que virou owner no backfill) e passa a barrar a
-- recepcao no nivel do banco, nao so na tela.


-- --------------------------------------------------------------------------
-- VERIFICACAO — rodar depois de aplicar
-- --------------------------------------------------------------------------
-- 1) Todo parceiro existente tem exatamente um owner?
--    SELECT p.id, p.fantasy_name, count(m.*) FILTER (WHERE m.papel='owner')
--      FROM public.partners p
--      LEFT JOIN public.partner_members m ON m.partner_id = p.id
--     GROUP BY 1,2 HAVING count(m.*) FILTER (WHERE m.papel='owner') <> 1;
--    (deve voltar vazio)
--
-- 2) Nenhuma policy permissiva sem clausula TO:
--    SELECT tablename, policyname, roles FROM pg_policies
--     WHERE schemaname='public' AND 'public' = ANY(roles);
--
-- 3) Teste pratico: logar como a recepcao e tentar
--    PATCH /rest/v1/partner_products?id=eq.<id>  -> tem que dar 401/403
--    GET   /rest/v1/<tabela_da_carteira>          -> tem que vir vazio
-- ==========================================================================
