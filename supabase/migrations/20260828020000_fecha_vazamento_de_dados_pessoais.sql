-- Fecha a leitura anônima de dados pessoais de 413 alunos.
--
-- MEDIDO em 28/08/2026 com a chave publicável do `.env` (a mesma que vai no
-- pacote do navegador, ou seja: pública):
--
--   GET /rest/v1/academia_credenciais  -> 206, 413 linhas
--   GET /rest/v1/academia_frequencias  -> 206, 189 linhas
--   GET /rest/v1/academia_avisos       -> 206,  11 linhas
--
-- São nome, telefone e nascimento de todo mundo que treina na academia, mais o
-- registro de quem entrou e a que horas.
--
-- POR QUE ACONTECIA. As policies usam `academia_pode_ver(partner_id)`, que
-- começa com `WHEN auth.uid() IS NULL THEN true`. O comentário diz que é para o
-- service_role — mas o service_role tem BYPASSRLS e nunca chega a consultar
-- policy nenhuma. Quem cai naquele ramo é o visitante anônimo, que também tem
-- `auth.uid()` nulo. O atalho para quem não precisava dele virou a porta de
-- quem não deveria entrar.
--
-- POR QUE ESTE CONSERTO É SEGURO. `TO authenticated` não muda a função nem as
-- outras vinte policies que dependem dela. E as três tabelas são lidas em um
-- lugar só no sistema inteiro — `src/lib/academia-teste.functions.ts` —, sempre
-- pelo cliente `admin` (service_role), que ignora RLS. Conferido arquivo por
-- arquivo: nenhuma tela, rota pública ou edge function toca nelas.

DROP POLICY IF EXISTS academia_credenciais_acesso ON public.academia_credenciais;
CREATE POLICY academia_credenciais_acesso ON public.academia_credenciais
  FOR ALL
  TO authenticated
  USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

DROP POLICY IF EXISTS academia_frequencias_acesso ON public.academia_frequencias;
CREATE POLICY academia_frequencias_acesso ON public.academia_frequencias
  FOR ALL
  TO authenticated
  USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

DROP POLICY IF EXISTS academia_avisos_leitura ON public.academia_avisos;
CREATE POLICY academia_avisos_leitura ON public.academia_avisos
  FOR SELECT
  TO authenticated
  USING (public.academia_pode_ver(partner_id));

-- E a policy que eu mesmo escrevi ontem para `partner_feriados`, pelo mesmo
-- motivo e mais um: ela consultava `profiles` DIRETO, o que o CLAUDE.md proíbe.
-- Sem grant em profiles o Postgres recusava a leitura inteira — a academia
-- recebia "permission denied for table profiles" e não conseguia cadastrar
-- feriado nenhum. Quem pode consultar profiles é `academia_pode_ver`, que é
-- SECURITY DEFINER justamente para isso.
DROP POLICY IF EXISTS partner_feriados_membro ON public.partner_feriados;
CREATE POLICY partner_feriados_membro ON public.partner_feriados
  FOR ALL
  TO authenticated
  USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));
