-- Corrige academia_pode_ver: ela recusava tudo quando chamada pelo servidor.
--
-- O problema: a funcao decide com base em auth.uid(). Mas todas as server
-- functions chamam os RPCs pelo cliente de servico (service_role), onde
-- auth.uid() e NULO. Resultado: a checagem falhava sempre, mesmo para quem era
-- dono E membro da academia — "Sem acesso a esta academia" em tudo.
--
-- Quem chega sem auth.uid() nestas funcoes so pode ser o service_role: elas
-- estao REVOKED de PUBLIC e de anon, e o unico outro papel com permissao e
-- authenticated, que sempre traz JWT e portanto auth.uid(). E o service_role so
-- e usado dentro das server functions, que ja conferem master admin + vinculo
-- com a academia em autorizar() antes de chamar qualquer coisa.
--
-- Nenhuma funcao concedida a anon usa academia_pode_ver: as do agente
-- autenticam pelo proprio segredo.

CREATE OR REPLACE FUNCTION public.academia_pode_ver(p_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- service_role: a permissao ja foi conferida por quem chamou
    WHEN auth.uid() IS NULL THEN true
    ELSE
      public.is_master_admin_atual()
      AND (
        EXISTS (
          SELECT 1 FROM public.partner_members pm
            JOIN public.profiles pr ON pr.id = pm.profile_id
           WHERE pm.partner_id = p_partner_id AND pr.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.partners p
            JOIN public.profiles pr ON pr.id = p.profile_id
           WHERE p.id = p_partner_id AND pr.user_id = auth.uid()
        )
      )
  END;
$$;
