
DROP POLICY "leads_insert_all" ON public.leads;
CREATE POLICY "leads_insert_authenticated" ON public.leads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
