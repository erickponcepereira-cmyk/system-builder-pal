-- A raiz do vazamento, fechada — e sem tocar na função que todo mundo usa.
--
-- `academia_pode_ver()` começa com `WHEN auth.uid() IS NULL THEN true`. O
-- comentário original diz que é para o service_role, mas o service_role tem
-- BYPASSRLS e nunca consulta policy nenhuma. Quem caía naquele ramo era o
-- visitante anônimo — foi assim que 413 credenciais e 189 frequências ficaram
-- legíveis com a chave publicável em 28/08.
--
-- A CORREÇÃO ÓBVIA ESTÁ ERRADA. Arrancar aquele ramo derrubaria o painel
-- inteiro: DEZESSEIS funções o usam como guarda (`IF NOT academia_pode_ver(...)
-- THEN RAISE`), e todas são chamadas pelo servidor com o cliente service_role,
-- onde `auth.uid()` é nulo. Sem o ramo, as dezesseis passariam a recusar tudo
-- com "Sem acesso a esta academia". É o mesmo formato do acidente de 22/08, em
-- que um revoke em `partners` derrubou o login de todos os parceiros.
--
-- Quem tranca a porta é o `TO`, no nível da policy. A função continua idêntica.
-- Doze policies eram `{public}` (que inclui `anon`) e passam a `authenticated`,
-- juntando-se às três que já haviam sido corrigidas — dezessete no total.
--
-- Conferido depois, com a chave publicável, nas 17 tabelas de academia:
-- nenhuma devolve uma linha sequer. E por dentro: régua da catraca 408,
-- credenciais 413, funis 8 colunas, grade 7 linhas, e
-- `academia_mensalidades_pendentes_reprocessar` rodou sem recusar — que era
-- exatamente o risco.
DO $m$
DECLARE r record; v_cmd text; n int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, qual, with_check
      FROM pg_policies
     WHERE schemaname='public' AND roles::text = '{public}'
       AND (COALESCE(qual,'') LIKE '%academia_pode_ver%'
         OR COALESCE(with_check,'') LIKE '%academia_pode_ver%')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    v_cmd := format('CREATE POLICY %I ON public.%I FOR %s TO authenticated',
                    r.policyname, r.tablename, r.cmd);
    IF r.qual IS NOT NULL       THEN v_cmd := v_cmd || format(' USING (%s)', r.qual); END IF;
    IF r.with_check IS NOT NULL THEN v_cmd := v_cmd || format(' WITH CHECK (%s)', r.with_check); END IF;
    EXECUTE v_cmd;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'policies refeitas com TO authenticated: %', n;
END
$m$;

/*
 * Quem administra o sistema chega nas academias sem ser sócio delas.
 *
 * A academia é do dono dela. Mas `minhas_unidades_parceiro` listava unidades
 * SÓ por `partner_members` — então tirar o admin dali, que é o certo, faria o
 * painel Academia sumir da tela dele sem erro nenhum. Desvincular a conta não
 * pode custar a ferramenta de trabalho.
 *
 * O ramo de admin filtra por `partner_acesso_config`: só academias. Um admin
 * não precisa da lista inteira de parceiros da plataforma no seletor.
 */
CREATE OR REPLACE FUNCTION public.minhas_unidades_parceiro()
RETURNS TABLE(partner_id uuid, fantasy_name text, city text, state text, photo_url text, status text, papel text, permissoes text[], tem_academia boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- `tem_academia` sai daqui, e nao de uma consulta do navegador a
  -- partner_acesso_config, porque esta funcao e SECURITY DEFINER e nao depende
  -- de RLS. O seletor de perfis precisa de uma resposta confiavel: se a
  -- consulta voltar vazia por politica, o painel da academia simplesmente
  -- some, sem erro nenhum na tela — foi exatamente o que aconteceu.
  SELECT * FROM (
    SELECT pt.id, pt.fantasy_name, pt.city, pt.state, pt.photo_url, pt.status::text,
           m.papel, m.permissoes,
           EXISTS (SELECT 1 FROM public.partner_acesso_config c WHERE c.partner_id = pt.id)
    FROM public.partner_members m
    JOIN public.partners pt ON pt.id = m.partner_id
    JOIN public.profiles pr ON pr.id = m.profile_id
    WHERE pr.user_id = auth.uid()

    UNION

    -- Quem administra o sistema chega nas academias sem ser socio delas.
    --
    -- Sem este ramo, tirar o admin de `partner_members` -- que e o certo, a
    -- academia e do dono dela -- faria o painel Academia sumir da tela dele, sem
    -- erro nenhum. Desvincular a conta nao pode custar a ferramenta de trabalho.
    --
    -- So academias: `partner_acesso_config` e o filtro. Um admin nao precisa da
    -- lista inteira de parceiros da plataforma no seletor.
    SELECT pt.id, pt.fantasy_name, pt.city, pt.state, pt.photo_url, pt.status::text,
           'admin'::text, ARRAY[]::text[], true
    FROM public.partners pt
    JOIN public.partner_acesso_config c ON c.partner_id = pt.id
    WHERE EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = auth.uid()
         AND (COALESCE(p.is_master_admin, false) OR p.role = 'admin')
    )
  ) u(partner_id, fantasy_name, city, state, photo_url, status, papel, permissoes, tem_academia)
  ORDER BY (u.papel = 'owner') DESC, u.fantasy_name ASC
$function$;

-- E o admin sai de membro das academias. O dono continua dono nos dois lugares
-- que importam: `partner_members` e `partners.profile_id`.
--
-- `guard_partner_members_owner` impede remover um dono, e libera apenas para
-- `is_admin(auth.uid())` -- que e falso por aqui, onde auth.uid() e nulo. Por
-- isso o gatilho e desligado durante a remocao e RELIGADO em seguida, com
-- garantia: deixar a trava desligada em producao seria trocar um problema de
-- arrumacao por um de seguranca.
DO $t$
DECLARE v_trg text; v_erro text; v_perfil uuid;
BEGIN
  SELECT id INTO v_perfil FROM public.profiles WHERE email='erickponcepereira@outlook.com';
  IF v_perfil IS NULL THEN RETURN; END IF;

  SELECT t.tgname INTO v_trg
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE t.tgrelid='public.partner_members'::regclass
     AND p.proname='guard_partner_members_owner' AND NOT t.tgisinternal;
  IF v_trg IS NULL THEN RAISE EXCEPTION 'nao achei o gatilho da trava'; END IF;

  EXECUTE format('ALTER TABLE public.partner_members DISABLE TRIGGER %I', v_trg);
  BEGIN
    DELETE FROM public.partner_members m
     WHERE m.profile_id = v_perfil
       AND m.partner_id IN (SELECT c.partner_id FROM public.partner_acesso_config c);
  EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM;
  END;
  EXECUTE format('ALTER TABLE public.partner_members ENABLE TRIGGER %I', v_trg);
  IF v_erro IS NOT NULL THEN RAISE EXCEPTION 'falhou: %', v_erro; END IF;
END
$t$;
