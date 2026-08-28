-- A pessoa passa a ser marcada como avisada quando a mensagem SAI, não quando
-- a campanha é montada. E quem pagou no meio do caminho não recebe cobrança.
--
-- Duas coisas que eram a mesma raiz:
--
-- 1. `academia_avisos` era escrito por `academia_avisos_preparar`, na montagem.
--    Campanha que não disparava deixava as pessoas marcadas como avisadas sem
--    terem recebido nada — e elas só voltavam a entrar se ainda casassem com um
--    marco ativo no dia seguinte. Com d1 e d2 desligados, quase nunca casavam.
--
-- 2. Entre montar (8h) e enviar (9h) cabe uma renovação no balcão. A pessoa
--    pagava às 8h30 e recebia "seu plano expira hoje" às 9h. Cobrança de quem
--    acabou de pagar não é um detalhe: é o cliente perdendo a confiança no que
--    o sistema diz.

ALTER TABLE public.academia_avisos
  ADD COLUMN IF NOT EXISTS enviado_em timestamptz;

COMMENT ON COLUMN public.academia_avisos.enviado_em IS
  'Quando a mensagem realmente saiu. NULL = está numa campanha esperando disparo.';

COMMENT ON COLUMN public.academia_avisos.gerado_em IS
  'Quando a campanha foi montada. Não significa que a pessoa foi avisada — isso é enviado_em.';

-- O que já saiu, saiu: campanha concluída ou em andamento tinha as mensagens na
-- fila. Só as que estão em rascunho ficam sem data de envio, que é a verdade.
UPDATE public.academia_avisos e
   SET enviado_em = e.gerado_em
  FROM public.bot_disparos d
 WHERE d.id = e.disparo_id
   AND e.enviado_em IS NULL
   AND d.status IN ('concluido', 'enviando', 'enfileirando');

/*
 * Quem ainda deve receber ESTA campanha.
 *
 * Chamado na hora de disparar, não na de montar. Tira duas gentes da lista:
 * quem já recebeu, e quem renovou depois que a campanha foi montada — o
 * vencimento guardado no aviso deixou de ser o vencimento da pessoa.
 */
CREATE OR REPLACE FUNCTION public.academia_avisos_devidos(p_disparo_id uuid)
RETURNS TABLE(telefone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT e.telefone
    FROM public.academia_avisos e
   WHERE e.disparo_id = p_disparo_id
     AND e.enviado_em IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.academia_mensalidades m
        WHERE m.partner_id = e.partner_id
          AND m.status = 'ativa'
          AND (m.credencial_id = e.credencial_id
            OR (e.credencial_id IS NULL AND e.student_id IS NOT NULL AND m.student_id = e.student_id))
          AND m.valido_ate > e.valido_ate
     );
$function$;

/* Carimba como enviado. Só o que realmente entrou na fila. */
CREATE OR REPLACE FUNCTION public.academia_avisos_marcar_enviados(
  p_disparo_id uuid,
  p_telefones text[]
)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH marcados AS (
    UPDATE public.academia_avisos
       SET enviado_em = now()
     WHERE disparo_id = p_disparo_id
       AND enviado_em IS NULL
       AND telefone = ANY(p_telefones)
    RETURNING 1
  )
  SELECT count(*)::integer FROM marcados;
$function$;

REVOKE EXECUTE ON FUNCTION public.academia_avisos_devidos(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.academia_avisos_marcar_enviados(uuid, text[]) FROM PUBLIC, anon, authenticated;

/*
 * Quem precisa de aviso hoje — agora olhando envio, não montagem.
 *
 * Três situações, três respostas:
 *   já recebeu neste ciclo, ou já recebeu hoje  -> fica de fora
 *   está numa campanha viva esperando sair       -> fica de fora (não duplica)
 *   estava numa campanha que morreu sem enviar   -> VOLTA para a fila
 *
 * A terceira é a correção. Antes, morrer sem enviar era igual a ter recebido.
 */
CREATE OR REPLACE FUNCTION public.academia_avisos_pendentes(p_partner_id uuid)
 RETURNS TABLE(student_id uuid, credencial_id uuid, nome text, telefone text, marco text, dias_restantes integer, valido_ate date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_carencia integer; v_tz text; v_hoje date;
BEGIN
  SELECT COALESCE(c.dias_carencia, 3), COALESCE(c.timezone, 'America/Sao_Paulo')
    INTO v_carencia, v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_carencia := COALESCE(v_carencia, 3);
  v_tz       := COALESCE(v_tz, 'America/Sao_Paulo');
  -- O dia e o da academia, nao o do servidor. Em Cuiaba isso ja custou caro.
  v_hoje     := (now() AT TIME ZONE v_tz)::date;

  RETURN QUERY
  WITH casados AS (
    -- UM aviso por pessoa. Dois marcos podem cair no mesmo dia: 'vencimento -3'
    -- e 'bloqueio 0' com carencia 3 sao a mesma data. A academia pode criar
    -- essa sobreposicao sem perceber, ou cria-la meses depois so mudando a
    -- carencia -- por isso a defesa fica aqui, na hora de disparar, e nao numa
    -- validacao de cadastro. Ganha o marco de menor posicao.
    SELECT DISTINCT ON (COALESCE(a.credencial_id::text, a.student_id::text))
           a.student_id     AS r_student,
           a.credencial_id  AS r_credencial,
           -- Aluno da plataforma tem nome no perfil; aluno so da academia tem o
           -- nome que o proprio leitor conhece.
           COALESCE(pr.name, cr.nome_no_equipamento)::text AS r_nome,
           COALESCE(pr.phone, cr.telefone)::text           AS r_telefone,
           mo.marco         AS r_marco,
           mo.posicao       AS r_posicao,
           a.dias_restantes AS r_dias,
           a.valido_ate     AS r_ate
      FROM public.acesso_avaliar_academia(p_partner_id) a
      LEFT JOIN public.students s   ON s.id = a.student_id
      LEFT JOIN public.profiles pr  ON pr.id = s.profile_id
      LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
      -- O marco casa quando o dia bate exatamente. A conta muda conforme a
      -- referencia: 'vencimento' e o proprio dias_restantes; 'bloqueio' desloca
      -- pela carencia da academia, nunca por um numero fixo.
      JOIN public.academia_avisos_modelos mo
        ON mo.partner_id = p_partner_id
       AND mo.ativo
       AND a.dias_restantes = CASE mo.referencia
             WHEN 'vencimento' THEN mo.quando
             ELSE mo.quando - v_carencia
           END
     WHERE NOT EXISTS (
         SELECT 1 FROM public.academia_avisos e
          LEFT JOIN public.bot_disparos d ON d.id = e.disparo_id
          WHERE e.partner_id = p_partner_id
            AND COALESCE(e.credencial_id::text, e.student_id::text)
                = COALESCE(a.credencial_id::text, a.student_id::text)
            AND (
                 -- Ja recebeu: o mesmo marco no mesmo ciclo nao se repete, e
                 -- ninguem leva dois avisos no mesmo dia, seja qual for o marco.
                 (e.enviado_em IS NOT NULL
                  AND ((e.valido_ate = a.valido_ate AND e.marco = mo.marco)
                    OR (e.enviado_em AT TIME ZONE v_tz)::date = v_hoje))
                 -- Ainda nao recebeu, mas ja esta numa campanha viva: esperar,
                 -- nao duplicar. Campanha morta nao prende ninguem.
                 OR (e.enviado_em IS NULL
                     AND d.status IN ('rascunho','enfileirando','enviando'))
                )
       )
     ORDER BY COALESCE(a.credencial_id::text, a.student_id::text), mo.posicao
  )
  SELECT r_student, r_credencial, r_nome, r_telefone, r_marco, r_dias, r_ate
    FROM casados
   ORDER BY r_dias DESC, r_nome;
END;
$function$;
