-- ============================================================================
-- Moderar avaliação, e responder a ela.
--
-- `product_reviews` nasceu com `hidden_at`, `hidden_by`, `hidden_reason` e
-- `seller_reply` — e com nenhuma tela para nada disso. Enquanto ficar assim, a
-- primeira avaliação ofensiva só sai do ar por SQL, e o vendedor não tem como
-- responder a uma crítica. Num marketplace, vendedor que não responde perde a
-- venda seguinte.
--
-- O nome do produto vem por função porque o catálogo é unificado: uma
-- avaliação aponta para (origem, id), e o id vive em `products`,
-- `partner_products` ou `professional_products` conforme a origem. Resolver
-- isso no cliente seria três consultas e um `in()` gigante.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.avaliacoes_para_moderar(_incluir_escondidas boolean DEFAULT true)
RETURNS TABLE (
  id uuid,
  product_origin text,
  product_id uuid,
  produto text,
  vendedor_id uuid,
  rating smallint,
  comment text,
  seller_reply text,
  hidden_at timestamptz,
  hidden_reason text,
  created_at timestamptz,
  autor text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn_moderar$
  SELECT r.id,
         r.product_origin,
         r.product_id,
         COALESCE(p.name, pp.name, fp.name, '(produto removido)')::text AS produto,
         COALESCE(pp.partner_id, fp.coach_id) AS vendedor_id,
         r.rating,
         r.comment,
         r.seller_reply,
         r.hidden_at,
         r.hidden_reason,
         r.created_at,
         COALESCE(NULLIF(btrim(pr.name), ''), 'Cliente')::text AS autor
    FROM public.product_reviews r
    LEFT JOIN public.profiles pr ON pr.id = r.author_id
    LEFT JOIN public.products p ON p.id = r.product_id AND r.product_origin = 'fitmind'
    LEFT JOIN public.partner_products pp ON pp.id = r.product_id AND r.product_origin = 'partner'
    LEFT JOIN public.professional_products fp ON fp.id = r.product_id AND r.product_origin = 'professional'
   WHERE public.is_admin(auth.uid())
     AND (_incluir_escondidas OR r.hidden_at IS NULL)
   ORDER BY r.created_at DESC
   LIMIT 500;
$fn_moderar$;

GRANT EXECUTE ON FUNCTION public.avaliacoes_para_moderar(boolean) TO authenticated;

COMMENT ON FUNCTION public.avaliacoes_para_moderar(boolean) IS
  'Avaliacoes com o nome do produto resolvido nas tres origens, para a tela de moderacao. Devolve vazio para quem nao e admin — a checagem esta no WHERE, nao so na RLS.';

-- ----------------------------------------------------------------------------
-- Esconder e reexibir, com o motivo registrado.
--
-- Função em vez de UPDATE direto porque `hidden_by` tem de ser quem decidiu, e
-- isso o cliente não deve escolher.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.moderar_avaliacao(_id uuid, _esconder boolean, _motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn_mod$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'So administrador modera avaliacao.';
  END IF;

  IF _esconder AND COALESCE(btrim(_motivo), '') = '' THEN
    RAISE EXCEPTION 'Escrever o motivo e obrigatorio: daqui a seis meses ninguem lembra por que sumiu.';
  END IF;

  UPDATE public.product_reviews
     SET hidden_at     = CASE WHEN _esconder THEN now() ELSE NULL END,
         hidden_by     = CASE WHEN _esconder THEN public.current_profile_id() ELSE NULL END,
         hidden_reason = CASE WHEN _esconder THEN btrim(_motivo) ELSE NULL END
   WHERE id = _id;
END
$fn_mod$;

GRANT EXECUTE ON FUNCTION public.moderar_avaliacao(uuid, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.moderar_avaliacao(uuid, boolean, text) IS
  'Esconde ou reexibe uma avaliacao. Esconder exige motivo — sem ele a decisao vira um booleano sem memoria.';

-- ----------------------------------------------------------------------------
-- A resposta do vendedor.
--
-- Quem responde é o dono do produto, não o admin: a função confere que quem
-- chama é o parceiro daquele produto (ou o profissional dele), e o admin passa
-- porque também precisa poder corrigir.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.responder_avaliacao(_id uuid, _resposta text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn_resp$
DECLARE
  v_origem text;
  v_produto uuid;
  v_meu uuid := public.current_profile_id();
  v_pode boolean := false;
BEGIN
  IF COALESCE(btrim(_resposta), '') = '' THEN
    RAISE EXCEPTION 'A resposta nao pode ser vazia.';
  END IF;

  SELECT r.product_origin, r.product_id INTO v_origem, v_produto
    FROM public.product_reviews r WHERE r.id = _id;
  IF v_origem IS NULL THEN
    RAISE EXCEPTION 'Avaliacao nao encontrada.';
  END IF;

  IF public.is_admin(auth.uid()) THEN
    v_pode := true;
  ELSIF v_origem = 'partner' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.partner_products pp
        JOIN public.partners pa ON pa.id = pp.partner_id
       WHERE pp.id = v_produto AND pa.profile_id = v_meu
    ) INTO v_pode;
  ELSIF v_origem = 'professional' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.professional_products fp
        JOIN public.coaches c ON c.id = fp.coach_id
       WHERE fp.id = v_produto AND c.profile_id = v_meu
    ) INTO v_pode;
  END IF;

  IF NOT v_pode THEN
    RAISE EXCEPTION 'Este produto nao e seu: so o vendedor responde a avaliacao dele.';
  END IF;

  UPDATE public.product_reviews
     SET seller_reply = btrim(_resposta),
         seller_replied_at = now()
   WHERE id = _id;
END
$fn_resp$;

GRANT EXECUTE ON FUNCTION public.responder_avaliacao(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.responder_avaliacao(uuid, text) IS
  'Resposta do vendedor a uma avaliacao. Confere que quem chama e o dono do produto; admin passa para poder corrigir.';
