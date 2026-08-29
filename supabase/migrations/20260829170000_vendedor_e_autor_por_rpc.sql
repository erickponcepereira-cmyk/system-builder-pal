-- ============================================================================
-- A página do vendedor, e o nome de quem avaliou — os dois por RPC.
--
-- `unified-store.ts:585` já registra a lição com todas as letras: "Dados de
-- quem vende vêm por RPC, NUNCA por join embutido. `partners`, `coaches` e
-- `profiles` estão fechadas para leitura direta desde a correção de segurança."
-- Foi assim que o catálogo inteiro de parceiros sumiu da loja de uma vez.
--
-- A migration de avaliação repetiu o erro sem perceber: ela lê o nome do autor
-- com `profiles!product_reviews_author_id_fkey(name)`. Mas
-- `profiles_public_basic_select` exige `profile_has_approved_coach(id)` — o
-- perfil de um ALUNO comum não é legível por outro aluno. O resultado seria
-- toda avaliação assinada como "Cliente".
--
-- Aqui as duas coisas passam a vir por função, com o mínimo necessário e nada
-- além: o nome sai abreviado (primeiro nome + inicial), que é o que um
-- marketplace mostra, e o telefone do parceiro não sai de jeito nenhum —
-- `public_whatsapp` e `blocked_at` estão fora do grant de `authenticated` e
-- continuam fora.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Avaliações de um produto, com o nome de quem escreveu
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avaliacoes_do_produto(
  _origem text,
  _produto_id uuid,
  _limite int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  rating smallint,
  comment text,
  seller_reply text,
  seller_replied_at timestamptz,
  created_at timestamptz,
  autor text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn_avaliacoes$
  SELECT r.id,
         r.rating,
         r.comment,
         r.seller_reply,
         r.seller_replied_at,
         r.created_at,
         -- Primeiro nome e a inicial do sobrenome. Nome inteiro numa página
         -- pública é mais do que a avaliação precisa.
         CASE
           WHEN COALESCE(btrim(p.name), '') = '' THEN 'Cliente'
           WHEN position(' ' IN btrim(p.name)) = 0 THEN split_part(btrim(p.name), ' ', 1)
           ELSE split_part(btrim(p.name), ' ', 1) || ' ' ||
                left(split_part(btrim(p.name), ' ', 2), 1) || '.'
         END AS autor
    FROM public.product_reviews r
    LEFT JOIN public.profiles p ON p.id = r.author_id
   WHERE r.product_origin = _origem
     AND r.product_id = _produto_id
     AND r.hidden_at IS NULL
   ORDER BY r.created_at DESC
   LIMIT LEAST(COALESCE(_limite, 20), 100);
$fn_avaliacoes$;

GRANT EXECUTE ON FUNCTION public.avaliacoes_do_produto(text, uuid, int) TO authenticated;

COMMENT ON FUNCTION public.avaliacoes_do_produto(text, uuid, int) IS
  'Avaliacoes visiveis de um produto, com o nome do autor abreviado. Existe porque profiles nao e legivel direto: profiles_public_basic_select exige coach aprovado, entao o embed devolveria null para aluno comum.';

-- ----------------------------------------------------------------------------
-- A ficha pública de um vendedor
--
-- Um só ponto de entrada para os dois tipos, porque a página é uma só. O
-- `_tipo` decide de onde os dados saem: parceiro é empresa (`partners`),
-- profissional é pessoa (`coaches` + `profiles`).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendedor_publico(_tipo text, _id uuid)
RETURNS TABLE (
  id uuid,
  tipo text,
  nome text,
  descricao text,
  foto text,
  capa text,
  cidade text,
  uf text,
  ramo text,
  especialidade text,
  instagram text,
  site text,
  desde timestamptz,
  aprovado boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn_vendedor$
BEGIN
  IF _tipo = 'partner' THEN
    RETURN QUERY
      SELECT pa.id,
             'partner'::text,
             COALESCE(NULLIF(btrim(pa.fantasy_name), ''), 'Parceiro')::text,
             pa.description,
             pa.photo_url,
             pa.cover_url,
             pa.city::text,
             pa.state::text,
             pa.business_area,
             pa.specialty,
             pa.instagram,
             pa.website,
             COALESCE(pa.approved_at, pa.created_at),
             (pa.status = 'approved' AND pa.blocked_at IS NULL)
        FROM public.partners pa
       WHERE pa.id = _id
         -- Parceiro bloqueado ou nao aprovado nao tem pagina publica.
         AND pa.status = 'approved'
         AND pa.blocked_at IS NULL;

  ELSIF _tipo = 'professional' THEN
    RETURN QUERY
      SELECT c.id,
             'professional'::text,
             COALESCE(NULLIF(btrim(pr.name), ''), 'Profissional')::text,
             NULL::text,
             pr.avatar_url,
             NULL::text,
             pr.city::text,
             pr.state::text,
             NULL::text,
             c.specialty_key::text,
             NULL::text,
             NULL::text,
             c.created_at,
             true
        FROM public.coaches c
        JOIN public.profiles pr ON pr.id = c.profile_id
       WHERE c.id = _id;
  END IF;
END
$fn_vendedor$;

GRANT EXECUTE ON FUNCTION public.vendedor_publico(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.vendedor_publico(text, uuid) IS
  'Ficha publica de um vendedor, parceiro ou profissional. Nao devolve telefone nem documento: public_whatsapp esta fora do grant de authenticated de proposito.';

-- ----------------------------------------------------------------------------
-- Os sinais de confiança do vendedor
--
-- Nota média e quantas avaliações, quantos produtos, e há quanto tempo vende.
-- Nada de faturamento: quanto ele fatura não é da conta de quem compra.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reputacao_do_vendedor(_tipo text, _id uuid)
RETURNS TABLE (
  produtos int,
  avaliacoes int,
  nota numeric,
  vendas int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn_reputacao$
  WITH ids AS (
    SELECT pp.id
      FROM public.partner_products pp
     WHERE _tipo = 'partner' AND pp.partner_id = _id
       AND pp.status = 'approved' AND pp.is_active_by_partner AND pp.deleted_at IS NULL
    UNION ALL
    SELECT fp.id
      FROM public.professional_products fp
     WHERE _tipo = 'professional' AND fp.coach_id = _id
       AND fp.status = 'approved' AND fp.is_active_by_professional
  )
  SELECT (SELECT count(*) FROM ids)::int,
         COALESCE((SELECT count(*) FROM public.product_reviews r
                    WHERE r.product_id IN (SELECT id FROM ids)
                      AND r.hidden_at IS NULL), 0)::int,
         (SELECT round(avg(r.rating)::numeric, 2) FROM public.product_reviews r
           WHERE r.product_id IN (SELECT id FROM ids) AND r.hidden_at IS NULL),
         -- partner_product_orders nao tem 'product_id': cada origem tem a
         -- propria coluna, e um pedido carrega uma ou a outra.
         COALESCE((SELECT count(*) FROM public.partner_product_orders o
                    WHERE (o.partner_product_id IN (SELECT id FROM ids)
                        OR o.professional_product_id IN (SELECT id FROM ids))
                      AND o.status = 'paid'), 0)::int;
$fn_reputacao$;

GRANT EXECUTE ON FUNCTION public.reputacao_do_vendedor(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.reputacao_do_vendedor(text, uuid) IS
  'Sinais de confianca de um vendedor: quantos produtos, quantas avaliacoes, nota media e quantas vendas concluidas. Nao devolve faturamento.';
