DROP POLICY IF EXISTS "Criar quadro no meu escopo" ON public.crm_quadros;

CREATE POLICY "Criar quadro no meu escopo" ON public.crm_quadros
  FOR INSERT TO authenticated
  WITH CHECK (
    COALESCE(public.is_admin(auth.uid()), false)
    OR CASE escopo
      WHEN 'parceiro' THEN public.partner_pode(owner_id, 'crm')
      WHEN 'coach' THEN EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = owner_id AND pr.user_id = auth.uid())
      WHEN 'profissional' THEN EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = owner_id AND pr.user_id = auth.uid())
      WHEN 'admin' THEN COALESCE(public.is_admin(auth.uid()), false)
      ELSE false
    END
  );