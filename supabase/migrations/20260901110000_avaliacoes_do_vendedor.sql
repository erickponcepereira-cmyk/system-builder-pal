-- ============================================================================
-- O vendedor vê as avaliações dos produtos dele.
--
-- `responder_avaliacao` já aceita o dono do produto desde ontem, mas a única
-- tela que a chama é a do admin. O parceiro sabia que existe resposta e não
-- tinha por onde escrever.
--
-- Uma função em vez de leitura direta porque a pergunta "quais produtos são
-- meus" atravessa três tabelas — `partners` ou `coaches` pelo `profile_id`, e
-- daí para `partner_products` ou `professional_products`. Deixar isso no
-- cliente seria mandar o navegador ler `partners`, que está fechada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.avaliacoes_dos_meus_produtos()
RETURNS TABLE (
  id uuid,
  produto text,
  product_id uuid,
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
AS $fn_minhas$
  WITH meus AS (
    SELECT pp.id, pp.name, 'partner'::text AS origem
      FROM public.partner_products pp
      JOIN public.partners pa ON pa.id = pp.partner_id
     WHERE pa.profile_id = public.current_profile_id()
    UNION ALL
    SELECT fp.id, fp.name, 'professional'::text
      FROM public.professional_products fp
      JOIN public.coaches c ON c.id = fp.coach_id
     WHERE c.profile_id = public.current_profile_id()
  )
  SELECT r.id,
         m.name::text,
         r.product_id,
         r.rating,
         r.comment,
         r.seller_reply,
         r.seller_replied_at,
         r.created_at,
         -- Primeiro nome e inicial, igual à vitrine. O vendedor responde a um
         -- cliente, não recebe a lista de nomes completos de quem comprou.
         CASE
           WHEN COALESCE(btrim(p.name), '') = '' THEN 'Cliente'
           WHEN position(' ' IN btrim(p.name)) = 0 THEN split_part(btrim(p.name), ' ', 1)
           ELSE split_part(btrim(p.name), ' ', 1) || ' ' ||
                left(split_part(btrim(p.name), ' ', 2), 1) || '.'
         END::text AS autor
    FROM public.product_reviews r
    JOIN meus m ON m.id = r.product_id AND m.origem = r.product_origin
    LEFT JOIN public.profiles p ON p.id = r.author_id
   WHERE r.hidden_at IS NULL
   ORDER BY (r.seller_reply IS NOT NULL), r.created_at DESC
   LIMIT 300;
$fn_minhas$;

GRANT EXECUTE ON FUNCTION public.avaliacoes_dos_meus_produtos() TO authenticated;

COMMENT ON FUNCTION public.avaliacoes_dos_meus_produtos() IS
  'Avaliacoes visiveis dos produtos de quem chama, parceiro ou profissional. Sem resposta primeiro, que e o que precisa de acao. Nome do autor abreviado: o vendedor responde a um cliente, nao recebe a lista de quem comprou.';
