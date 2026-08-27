-- O plano passa a reconhecer os nomes antigos dele.
--
-- O catálogo da academia diz "Mensal - Livre". As 413 mensalidades importadas
-- do Next Fit dizem "Funcional - Mensal - Livre". É o mesmo plano, e nada no
-- banco sabia disso: a projeção de receita casou 3 pessoas de 138 e mostrou
-- R$ 410 onde há dezenas de milhares.
--
-- Renomear as mensalidades apagaria o que a academia realmente vendeu. Renomear
-- o catálogo estragaria a tela de venda. O que falta é o vínculo: cada plano
-- carrega a lista de nomes que já foram ele.
--
-- Isso não é só relatório. Quando alguém importado renovar, `academia_renovar`
-- procura o plano pelo nome para herdar o limite semanal — e não achava.

ALTER TABLE public.academia_planos
  ADD COLUMN IF NOT EXISTS apelidos text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.academia_planos.apelidos IS
  'Nomes antigos/importados que significam este mesmo plano. Comparação sem diferenciar maiúsculas.';

-- Casa um texto de plano contra o catálogo, pelo nome ou por apelido.
CREATE OR REPLACE FUNCTION public.academia_plano_do_texto(p_partner_id uuid, p_texto text)
RETURNS public.academia_planos
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT pl.* FROM public.academia_planos pl
   WHERE pl.partner_id = p_partner_id
     AND p_texto IS NOT NULL
     AND (lower(btrim(pl.nome)) = lower(btrim(p_texto))
       OR EXISTS (SELECT 1 FROM unnest(pl.apelidos) a
                   WHERE lower(btrim(a)) = lower(btrim(p_texto))))
   -- Nome exato ganha de apelido, para o caso de dois planos brigarem pelo texto.
   ORDER BY (lower(btrim(pl.nome)) = lower(btrim(p_texto))) DESC, pl.posicao
   LIMIT 1;
$function$;

-- Os apelidos reais da Estação Funcional, tirados do que está em uso hoje.
-- "FUNCIONAL 3X PROMOCIONAL" entra como 3x: o preço é outro, mas a REGRA de
-- três dias por semana é a mesma, e é ela que a catraca precisa herdar.
UPDATE public.academia_planos SET apelidos = ARRAY['Funcional - Mensal - Livre','MENSAL LIVRE','Mensal']
 WHERE partner_id IN (SELECT public.academia_parceiros_do_grupo('646c99dd-23cc-4da5-ba96-e52cfb1384b4'))
   AND nome = 'Mensal - Livre';
UPDATE public.academia_planos SET apelidos = ARRAY['Funcional - Mensal - 3x semana','FUNCIONAL 3X PROMOCIONAL']
 WHERE partner_id IN (SELECT public.academia_parceiros_do_grupo('646c99dd-23cc-4da5-ba96-e52cfb1384b4'))
   AND nome = 'Mensal - 3x semana';
UPDATE public.academia_planos SET apelidos = ARRAY['Funcional - Trimestral - Livre']
 WHERE partner_id IN (SELECT public.academia_parceiros_do_grupo('646c99dd-23cc-4da5-ba96-e52cfb1384b4'))
   AND nome = 'Trimestral - Livre';
UPDATE public.academia_planos SET apelidos = ARRAY['Funcional - Trimestral - 3x semana']
 WHERE partner_id IN (SELECT public.academia_parceiros_do_grupo('646c99dd-23cc-4da5-ba96-e52cfb1384b4'))
   AND nome = 'Trimestral - 3x semana';
