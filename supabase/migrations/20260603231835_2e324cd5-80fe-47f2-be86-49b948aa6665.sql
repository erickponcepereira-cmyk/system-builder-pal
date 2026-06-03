UPDATE public.professional_specialties
SET capabilities = capabilities || jsonb_build_object('can_view_confidential_medical_notes', true)
WHERE key IN ('doctor', 'cardiologist');

UPDATE public.professional_specialties
SET capabilities = capabilities - 'can_view_confidential_medical_notes'
WHERE key NOT IN ('doctor', 'cardiologist')
  AND capabilities ? 'can_view_confidential_medical_notes';