-- Remove eventos antigos sincronizados do calendário pessoal (antes do FitMindClub dedicado)
DELETE FROM public.internal_appointments WHERE source = 'google';

-- Limpa tokens existentes para forçar reconexão com o novo escopo (calendar full)
-- necessário para criar o calendário dedicado FitMindClub
DELETE FROM public.coach_google_tokens;