-- O aluno passa a mandar o próprio rosto para a catraca.
--
-- Até aqui só a recepção cadastrava: alguém tinha que estar no balcão com a
-- pessoa na frente. Quem já é aluno da plataforma e está vinculado a uma
-- credencial de academia pode resolver isso do celular, antes de chegar.
--
-- A SEGURANÇA ESTÁ NA ASSINATURA, não numa checagem que dá para esquecer:
-- estas funções NÃO recebem partner_id nem credencial_id. A credencial é
-- derivada do `auth.uid()` — não existe parâmetro para o cliente forjar.

/**
 * A academia do aluno logado, e o estado do acesso dele.
 *
 * Devolve no máximo uma linha. Se o aluno não estiver vinculado a nenhuma
 * credencial de academia, devolve vazio — e a aba nem aparece.
 */
CREATE OR REPLACE FUNCTION public.academia_minha_credencial()
RETURNS TABLE(
  academia      text,
  referencia    text,
  tem_rosto     boolean,
  envio_pendente boolean,
  valido_ate    date,
  decisao       text,
  motivo        text,
  dias_restantes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_student uuid;
BEGIN
  SELECT s.id INTO v_student
    FROM public.students s
    JOIN public.profiles pr ON pr.id = s.profile_id
   WHERE pr.user_id = auth.uid();

  IF v_student IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT pt.fantasy_name::text,
         cr.referencia::text,
         -- `importado_em` só é preenchido quando a pessoa foi LIDA do
         -- equipamento. Nulo significa que ela ainda não existe lá.
         (cr.importado_em IS NOT NULL),
         EXISTS (
           SELECT 1 FROM public.academia_faces_envio e
            WHERE e.referencia = cr.referencia
              AND e.partner_id = cr.partner_id
              AND e.status = 'pendente'
         ),
         a.valido_ate,
         a.decisao::text,
         a.motivo::text,
         a.dias_restantes
    FROM public.academia_credenciais cr
    JOIN public.partners pt ON pt.id = cr.partner_id
    -- As duas pontas, do mesmo jeito que o resto do projeto casa. Um COALESCE
    -- dos dois lados NAO serve aqui: cr.id nunca e nulo, entao o lado direito
    -- vira sempre cr.id e a mensalidade lancada pelo ALUNO nunca casaria.
    LEFT JOIN LATERAL public.acesso_avaliar_academia(cr.partner_id) a
           ON (a.credencial_id = cr.id
            OR (a.credencial_id IS NULL AND cr.student_id IS NOT NULL AND a.student_id = cr.student_id))
   WHERE cr.student_id = v_student AND cr.ativo
   ORDER BY cr.created_at
   LIMIT 1;
END;
$function$;

/**
 * Enfileira a foto do próprio aluno.
 *
 * Sem partner_id e sem credencial_id de propósito: os dois saem do vínculo do
 * usuário logado. Assim não existe caminho para um aluno mandar foto para a
 * credencial de outra pessoa — que num controle de acesso seria alguém
 * entrando no lugar de outro.
 *
 * A foto não fica guardada: o agente grava no leitor e a nuvem apaga o base64
 * na confirmação, cumprindo o prazo de LGPD que já vale para o outro caminho.
 */
CREATE OR REPLACE FUNCTION public.academia_meu_rosto_enfileirar(p_foto_base64 text)
RETURNS TABLE(envio_id uuid, referencia text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_perfil uuid;
  v_student uuid;
  v_cred RECORD;
  v_id uuid;
BEGIN
  SELECT pr.id, s.id INTO v_perfil, v_student
    FROM public.profiles pr
    LEFT JOIN public.students s ON s.profile_id = pr.id
   WHERE pr.user_id = auth.uid();

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Voce nao esta vinculado a uma academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF COALESCE(length(p_foto_base64), 0) < 1000 THEN
    RAISE EXCEPTION 'Foto ausente ou pequena demais.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.id, c.partner_id, c.referencia, c.nome_no_equipamento
    INTO v_cred
    FROM public.academia_credenciais c
   WHERE c.student_id = v_student AND c.ativo
   ORDER BY c.created_at
   LIMIT 1;

  IF v_cred.id IS NULL THEN
    RAISE EXCEPTION 'Voce nao tem credencial ativa em nenhuma academia.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mandar de novo substitui a anterior. Duas fotos na fila para a mesma
  -- pessoa fariam o agente gravar uma por cima da outra sem ordem definida.
  UPDATE public.academia_faces_envio e
     SET status = 'erro',
         erro = 'Substituida por uma foto mais recente',
         foto_base64 = NULL
   WHERE e.partner_id = v_cred.partner_id
     AND e.referencia = v_cred.referencia
     AND e.status = 'pendente';

  INSERT INTO public.academia_faces_envio
    (partner_id, student_id, referencia, nome, foto_base64, criado_por)
  VALUES
    (v_cred.partner_id, v_student, v_cred.referencia,
     COALESCE(NULLIF(trim(v_cred.nome_no_equipamento), ''), 'Aluno da academia'),
     p_foto_base64, v_perfil)
  RETURNING id INTO v_id;

  envio_id := v_id;
  referencia := v_cred.referencia;
  RETURN NEXT;
END;
$function$;
