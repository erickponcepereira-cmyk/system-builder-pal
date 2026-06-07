
UPDATE public.patent_rules
SET min_own_sales_pct = 75, max_team_sales_pct = 25,
    vp_max_pct = 75, ve_max_pct = 25
WHERE key IN ('contribuidor','construtor') AND is_active = true;

-- Explorador é o cadastro inicial (R$ 0), mantém qualquer distribuição: apenas alinha vp/ve.
UPDATE public.patent_rules
SET vp_max_pct = 75, ve_max_pct = 25
WHERE key = 'explorador' AND is_active = true;

DELETE FROM public.coach_patent_achievements
WHERE coach_id = 'f9a44c8a-31ea-4ca1-8cef-b9049733c5e1';
