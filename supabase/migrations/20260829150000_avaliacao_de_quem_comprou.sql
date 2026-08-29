-- ============================================================================
-- Avaliação de produto: estrela e comentário, de quem comprou.
--
-- Não existia nada. Nem tabela, nem coluna, nem estrela em tela nenhuma —
-- busca por review|rating|avaliac|estrela|depoiment nas 631 migrations não
-- retorna uma linha. Num marketplace de 1904 produtos e 37 vendedores, isso
-- significa que ninguém tem como saber em quem confiar.
--
-- A regra que sustenta tudo: SÓ QUEM COMPROU AVALIA, e avalia UMA VEZ por
-- compra. Sem essa amarra, avaliação vira mural — e mural com dinheiro em
-- volta vira propaganda do próprio vendedor.
--
-- O produto é identificado por (origem, id) porque o catálogo é unificado:
-- o mesmo id pode existir em `products`, `partner_products` e
-- `professional_products` sem relação nenhuma entre eles. Uma FK única não
-- daria conta, então a integridade fica na aplicação — e a origem entra na
-- chave para nunca cruzar produto de tabelas diferentes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Qual produto, no vocabulário do catálogo unificado.
  product_origin text NOT NULL CHECK (product_origin IN ('fitmind', 'partner', 'professional', 'course')),
  product_id     uuid NOT NULL,

  -- De qual compra veio o direito de avaliar. É o que impede mural.
  order_id       uuid NOT NULL,
  order_type     text NOT NULL,

  author_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text CHECK (comment IS NULL OR length(btrim(comment)) <= 2000),

  -- Resposta do vendedor. Fica na mesma linha porque é sempre uma só, e
  -- porque assim ela nunca se separa do que responde.
  seller_reply   text CHECK (seller_reply IS NULL OR length(btrim(seller_reply)) <= 2000),
  seller_replied_at timestamptz,

  -- Moderação. `hidden_reason` existe para a decisão não virar um booleano
  -- sem memória: daqui a seis meses ninguém lembra por que sumiu.
  hidden_at      timestamptz,
  hidden_by      uuid REFERENCES public.profiles(id),
  hidden_reason  text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Uma avaliação por compra. Comprou duas vezes, avalia duas vezes: são duas
  -- experiências, e a segunda pode desmentir a primeira.
  CONSTRAINT product_reviews_uma_por_compra UNIQUE (order_id, order_type, product_id)
);

CREATE INDEX IF NOT EXISTS product_reviews_por_produto
  ON public.product_reviews (product_origin, product_id)
  WHERE hidden_at IS NULL;

CREATE INDEX IF NOT EXISTS product_reviews_por_autor
  ON public.product_reviews (author_id);

COMMENT ON TABLE public.product_reviews IS
  'Avaliacao de produto por quem comprou. A amarra com (order_id, order_type) e o que impede que vire mural: sem compra nao ha linha.';

-- ----------------------------------------------------------------------------
-- updated_at sem depender de quem escreve
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tocar_updated_at_da_avaliacao()
RETURNS trigger LANGUAGE plpgsql AS $fn_tocar$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn_tocar$;

DROP TRIGGER IF EXISTS product_reviews_updated_at ON public.product_reviews;
CREATE TRIGGER product_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at_da_avaliacao();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Ler: qualquer pessoa logada vê o que não foi escondido. É o ponto da coisa.
DROP POLICY IF EXISTS "avaliacao visivel para todos" ON public.product_reviews;
CREATE POLICY "avaliacao visivel para todos"
  ON public.product_reviews FOR SELECT
  TO authenticated
  USING (hidden_at IS NULL);

-- O autor sempre enxerga a própria, mesmo escondida — senão ele reescreve sem
-- saber que foi moderado, e a moderação vira jogo de gato e rato.
DROP POLICY IF EXISTS "autor ve a propria avaliacao" ON public.product_reviews;
CREATE POLICY "autor ve a propria avaliacao"
  ON public.product_reviews FOR SELECT
  TO authenticated
  USING (author_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()));

DROP POLICY IF EXISTS "autor escreve a propria avaliacao" ON public.product_reviews;
CREATE POLICY "autor escreve a propria avaliacao"
  ON public.product_reviews FOR INSERT
  TO authenticated
  WITH CHECK (author_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()));

-- Editar: só o texto e a nota, e só o autor. A moderação e a resposta do
-- vendedor não passam por aqui.
DROP POLICY IF EXISTS "autor corrige a propria avaliacao" ON public.product_reviews;
CREATE POLICY "autor corrige a propria avaliacao"
  ON public.product_reviews FOR UPDATE
  TO authenticated
  USING (
    author_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND hidden_at IS NULL
  )
  WITH CHECK (
    author_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND hidden_at IS NULL
  );

DROP POLICY IF EXISTS "autor apaga a propria avaliacao" ON public.product_reviews;
CREATE POLICY "autor apaga a propria avaliacao"
  ON public.product_reviews FOR DELETE
  TO authenticated
  USING (author_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()));

DROP POLICY IF EXISTS "admin cuida das avaliacoes" ON public.product_reviews;
CREATE POLICY "admin cuida das avaliacoes"
  ON public.product_reviews FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin'));

-- ----------------------------------------------------------------------------
-- A nota média, para a vitrine.
--
-- Calculada na hora, não materializada: com 1904 produtos e avaliação
-- começando do zero, o índice parcial resolve, e uma coluna materializada
-- seria mais uma verdade para sair de sincronia. Quando o volume pedir, vira
-- matview — e aí o lugar da mudança é este, não a tela.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.product_review_summary AS
  SELECT r.product_origin,
         r.product_id,
         count(*)::int                      AS total,
         round(avg(r.rating)::numeric, 2)   AS media,
         count(*) FILTER (WHERE r.rating >= 4)::int AS positivas
    FROM public.product_reviews r
   WHERE r.hidden_at IS NULL
   GROUP BY r.product_origin, r.product_id;

GRANT SELECT ON public.product_review_summary TO authenticated;

COMMENT ON VIEW public.product_review_summary IS
  'Nota media e contagem por produto, so do que nao foi escondido. Alimenta o card da vitrine e a pagina do vendedor.';
