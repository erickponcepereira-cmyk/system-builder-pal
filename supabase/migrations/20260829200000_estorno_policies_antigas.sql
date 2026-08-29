-- ============================================================================
-- As tres policies de `return_requests` que sobraram de julho consultando
-- `profiles` por dentro.
--
-- Ontem eu troquei a de UPDATE, que era minha. Estas tres sao de 04/07 e
-- ficaram com o padrao que a CLAUDE.md proibe, e proibe por causa de um
-- incidente real: "Nunca consulte `profiles` de dentro de uma policy — use
-- `is_admin()`. Um revoke em `partners` derrubou o login de todos os parceiros
-- em 22/08/2026."
--
-- O problema nao e estilo. Uma policy que le outra tabela amarra a permissao
-- desta a permissao daquela: no dia em que alguem mexer num grant de
-- `profiles`, o estorno para de funcionar, e o erro vai aparecer a quilometros
-- do lugar que foi mexido.
--
-- `current_profile_id()` e `is_admin()` sao SECURITY DEFINER e existem
-- exatamente para cortar esse elo. A tabela so agora ganhou tela, entao este e
-- o momento de acertar — antes de haver linha dentro dela.
-- ============================================================================

DROP POLICY IF EXISTS "admins manage returns" ON public.return_requests;
CREATE POLICY "admins manage returns"
  ON public.return_requests
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "requester can create own returns" ON public.return_requests;
CREATE POLICY "requester can create own returns"
  ON public.return_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requested_by = public.current_profile_id());

DROP POLICY IF EXISTS "requester can view own returns" ON public.return_requests;
CREATE POLICY "requester can view own returns"
  ON public.return_requests
  FOR SELECT
  TO authenticated
  USING (requested_by = public.current_profile_id());
