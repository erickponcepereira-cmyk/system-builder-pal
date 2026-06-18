GRANT SELECT ON public.professional_specialties TO anon;
CREATE POLICY "specialties readable publicly" ON public.professional_specialties FOR SELECT TO anon USING (is_active = true);