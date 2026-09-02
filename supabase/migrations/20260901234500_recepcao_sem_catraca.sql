-- A recepcao sem catraca: achar a pessoa pelo nome ou CPF e registrar a entrada.
--
-- Ate hoje so duas coisas escreviam academia_frequencias: o agente da catraca e
-- a leitura de QR. O Reino Muay Thai nao tem catraca, e o QR exige conta no app
-- mais conciliacao -- hoje ~6 das 83 pessoas ativas. Na pratica a recepcao nao
-- tinha como fazer as duas coisas que mais importam onde a porta e humana:
-- saber se a pessoa esta em dia, e registrar que ela entrou.
--
-- A constraint de academia_frequencias.origem ja previa 'manual' desde sempre e
-- nada escrevia esse valor. Isto e o que faltava.
--
-- LIBERAR QUEM ESTA DEVENDO E PERMITIDO, E FICA REGISTRADO. Sem catraca a porta
-- e fisica: a recepcao vai deixar entrar de qualquer jeito. Entao o sistema
-- registra a entrada como 'manual', anota na observacao que foi liberacao de
-- quem estava bloqueado, e grava a ocorrencia em academia_acessos_negados com
-- quem liberou. Fingir que barrou produziria relatorio de frequencia falso --
-- e no Reino hoje isso seria 62 das 83 pessoas.

CREATE OR REPLACE FUNCTION public.academia_recepcao_buscar(p_partner_id uuid, p_termo text)
 RETURNS TABLE(credencial_id uuid, nome text, cpf text, referencia text,
               motivo text, valido_ate date, dias_restantes integer,
               liberado boolean, entrou_hoje boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz    text;
  v_hoje  date;
  v_chave text;
  v_cpf   text;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  v_chave := public.academia_nome_chave(p_termo);
  v_cpf   := nullif(regexp_replace(coalesce(p_termo, ''), '\D', '', 'g'), '');

  -- Menos de tres letras devolveria meia academia e nao ajuda ninguem na fila.
  IF (v_chave IS NULL OR length(v_chave) < 3) AND v_cpf IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cr.id,
         cr.nome_no_equipamento::text,
         cr.cpf::text,
         cr.referencia::text,
         COALESCE(a.motivo, 'sem_mensalidade')::text,
         a.valido_ate,
         a.dias_restantes,
         COALESCE(a.motivo, '') IN ('contrato_ativo', 'vencimento_proximo', 'em_carencia'),
         EXISTS (
           SELECT 1 FROM public.academia_frequencias f
            WHERE f.partner_id = p_partner_id
              AND f.credencial_id = cr.id
              AND (f.entrada_em AT TIME ZONE v_tz)::date = v_hoje
         )
    FROM public.academia_credenciais cr
    LEFT JOIN public.acesso_avaliar_academia(p_partner_id) a ON a.credencial_id = cr.id
   WHERE cr.partner_id = p_partner_id
     AND cr.ativo
     AND (
       (v_chave IS NOT NULL AND length(v_chave) >= 3
        AND public.academia_nome_chave(cr.nome_no_equipamento) LIKE '%' || v_chave || '%')
       OR (v_cpf IS NOT NULL
        AND regexp_replace(coalesce(cr.cpf, ''), '\D', '', 'g') LIKE v_cpf || '%')
     )
   ORDER BY cr.nome_no_equipamento
   LIMIT 20;
END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_recepcao_entrada(p_partner_id uuid, p_credencial_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cred     public.academia_credenciais%ROWTYPE;
  v_aval     record;
  v_liberado boolean;
  v_recente  uuid;
  v_quem     text;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_cred FROM public.academia_credenciais
   WHERE id = p_credencial_id AND partner_id = p_partner_id AND ativo;

  IF v_cred.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'liberado', false,
                              'erro', 'Pessoa nao encontrada nesta academia.');
  END IF;

  SELECT a.motivo, a.valido_ate, a.dias_restantes INTO v_aval
    FROM public.acesso_avaliar_academia(p_partner_id) a
   WHERE a.credencial_id = v_cred.id LIMIT 1;

  v_liberado := COALESCE(v_aval.motivo, '') IN ('contrato_ativo', 'vencimento_proximo', 'em_carencia');

  SELECT pr.name::text INTO v_quem
    FROM public.profiles pr WHERE pr.id = public.meu_profile_id();

  -- Mesma janela do QR: conferir a mesma pessoa duas vezes seguidas e a recepcao
  -- checando, nao a pessoa treinando duas vezes.
  SELECT f.id INTO v_recente FROM public.academia_frequencias f
   WHERE f.partner_id = p_partner_id AND f.credencial_id = v_cred.id
     AND f.entrada_em > now() - interval '5 minutes'
   ORDER BY f.entrada_em DESC LIMIT 1;

  IF v_recente IS NULL THEN
    INSERT INTO public.academia_frequencias
      (partner_id, credencial_id, student_id, origem, entrada_em, observacao)
    VALUES (p_partner_id, v_cred.id, v_cred.student_id, 'manual', now(),
            CASE WHEN v_liberado
                 THEN 'Entrada pela recepcao' || COALESCE(' (' || v_quem || ')', '')
                 ELSE 'Liberada pela recepcao mesmo bloqueada: '
                      || COALESCE(v_aval.motivo, 'sem_mensalidade')
                      || COALESCE(' (' || v_quem || ')', '')
            END);
  END IF;

  -- Quem entrou devendo fica registrado como ocorrencia, senao a liberacao
  -- some e o relatorio passa a dizer que ninguem entrou bloqueado.
  IF NOT v_liberado AND v_recente IS NULL THEN
    INSERT INTO public.academia_acessos_negados
      (partner_id, student_id, referencia, motivo, origem, detalhe)
    VALUES (p_partner_id, v_cred.student_id, v_cred.referencia,
            COALESCE(v_aval.motivo, 'sem_mensalidade'), 'manual',
            'Entrou assim mesmo, liberada na recepcao'
              || COALESCE(' por ' || v_quem, ''));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'liberado', v_liberado,
    'nome', v_cred.nome_no_equipamento,
    'motivo', COALESCE(v_aval.motivo, 'sem_mensalidade'),
    'valido_ate', v_aval.valido_ate,
    'dias_restantes', v_aval.dias_restantes,
    'repetido', v_recente IS NOT NULL);
END;
$function$;
