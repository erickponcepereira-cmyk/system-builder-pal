-- 1) Ficha de avaliação herda o sexo do cadastro (perfil) quando indefinida
UPDATE public.coach_evaluation_clients c
SET gender = CASE upper(p.gender) WHEN 'M' THEN 'male' WHEN 'F' THEN 'female' END
FROM public.students s
JOIN public.profiles p ON p.id = s.profile_id
WHERE c.student_id = s.id
  AND (c.gender IS NULL OR c.gender NOT IN ('male','female'))
  AND upper(COALESCE(p.gender,'')) IN ('M','F');

-- 2) Cadastro herda o sexo da ficha quando o perfil estiver vazio
UPDATE public.profiles p
SET gender = CASE c.gender WHEN 'male' THEN 'M' WHEN 'female' THEN 'F' END
FROM public.students s
JOIN public.coach_evaluation_clients c ON c.student_id = s.id
WHERE s.profile_id = p.id
  AND COALESCE(p.gender,'') = ''
  AND c.gender IN ('male','female');