-- `minhas_unidades_parceiro` passa a dizer quais unidades são academia.
--
-- O seletor de perfis consultava `partner_acesso_config` direto do navegador
-- para decidir se mostrava "Academia". Isso depende de RLS — e política que
-- devolve vazio NÃO dá erro: o item some da lista e ninguém descobre por quê.
-- Foi exatamente o que aconteceu, e custou uma ida à academia.
--
-- Esta função já é SECURITY DEFINER e já é a fonte das unidades do painel de
-- parceiro. Colocar a flag aqui troca "talvez a política deixe" por "a resposta
-- vem junto com a unidade".

DROP FUNCTION IF EXISTS public.minhas_unidades_parceiro();

CREATE FUNCTION public.minhas_unidades_parceiro()
RETURNS TABLE(partner_id uuid, fantasy_name text, city text, state text,
              photo_url text, status text, papel text, permissoes text[],
              tem_academia boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  -- `tem_academia` sai daqui, e nao de uma consulta do navegador a
  -- partner_acesso_config, porque esta funcao e SECURITY DEFINER e nao depende
  -- de RLS. O seletor de perfis precisa de uma resposta confiavel: se a
  -- consulta voltar vazia por politica, o painel da academia simplesmente
  -- some, sem erro nenhum na tela — foi exatamente o que aconteceu.
  SELECT pt.id, pt.fantasy_name, pt.city, pt.state, pt.photo_url, pt.status::text,
         m.papel, m.permissoes,
         EXISTS (SELECT 1 FROM public.partner_acesso_config c WHERE c.partner_id = pt.id)
  FROM public.partner_members m
  JOIN public.partners pt ON pt.id = m.partner_id
  JOIN public.profiles pr ON pr.id = m.profile_id
  WHERE pr.user_id = auth.uid()
  ORDER BY (m.papel = 'owner') DESC, pt.fantasy_name ASC
$function$;
