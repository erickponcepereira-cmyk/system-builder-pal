-- Quem faz day-use vira cartão no CRM, com telefone, na hora.
--
-- O gatilho se chama `dayuse_novo` porque o CHECK de academia_crm_regras já
-- previa esse nome desde a criação da tabela — só nunca tinha sido ligado.
--
-- O day-use é a visita mais barata de converter que uma academia tem: a pessoa
-- já veio, já treinou, já conhece a sala. Hoje o telefone dela entrava no banco
-- e morria ali — ninguém era lembrado de chamar de volta no dia seguinte.
--
-- O cartão nasce no momento do registro, e não por varredura depois, porque o
-- dado que importa (nome e telefone) só existe naquele instante: day-use não
-- tem credencial nem aluno, é CPF em hash.

-- A coluna do funil onde o day-use cai. Nasce depois de "Bloqueado" e antes de
-- "Contato feito" — é entrada de funil, não cobrança.
INSERT INTO public.crm_colunas (quadro_id, nome, posicao, tipo)
SELECT q.id, 'Day-use', 3500, 'normal'
  FROM public.crm_quadros q
 WHERE q.owner_id = '646c99dd-23cc-4da5-ba96-e52cfb1384b4'
   AND q.escopo = 'parceiro'
   AND NOT EXISTS (
     SELECT 1 FROM public.crm_colunas c WHERE c.quadro_id = q.id AND c.nome = 'Day-use'
   );

INSERT INTO public.academia_crm_regras (partner_id, gatilho, quadro_id, coluna_id, ativo)
SELECT '646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'dayuse_novo', c.quadro_id, c.id, true
  FROM public.crm_colunas c
  JOIN public.crm_quadros q ON q.id = c.quadro_id
 WHERE q.owner_id = '646c99dd-23cc-4da5-ba96-e52cfb1384b4' AND c.nome = 'Day-use'
ON CONFLICT (partner_id, gatilho) DO UPDATE
  SET quadro_id = EXCLUDED.quadro_id, coluna_id = EXCLUDED.coluna_id, ativo = true;

CREATE OR REPLACE FUNCTION public.academia_dayuse_registrar(
  p_partner_id uuid, p_cpf text, p_nome text, p_telefone text, p_tipo text,
  p_valor numeric, p_forma_pagamento text, p_taxa_percentual numeric,
  p_taxa_valor numeric, p_valor_liquido numeric, p_liberado_por uuid, p_observacao text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_decisao text;
  v_motivo text;
  v_tz text;
  v_id uuid;
  v_regra RECORD;
  v_tel text;
  v_digitos text := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
BEGIN
  SELECT a.decisao, a.motivo INTO v_decisao, v_motivo
    FROM public.academia_dayuse_avaliar(p_partner_id, p_cpf) a;

  IF v_decisao <> 'liberado' THEN
    RAISE EXCEPTION 'Day-use negado: %', v_motivo USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_tel := NULLIF(trim(COALESCE(p_telefone, '')), '');

  INSERT INTO public.academia_dayuse (
    partner_id, cpf_hash, cpf_final, nome, telefone, tipo, valor, forma_pagamento,
    taxa_percentual, taxa_valor, valor_liquido, usado_em, liberado_por, observacao
  ) VALUES (
    p_partner_id,
    public.academia_cpf_hash(p_partner_id, p_cpf),
    right(v_digitos, 3),
    p_nome,
    v_tel,
    COALESCE(p_tipo, 'day_use'),
    COALESCE(p_valor, 0),
    NULLIF(trim(COALESCE(p_forma_pagamento, '')), ''),
    COALESCE(p_taxa_percentual, 0),
    COALESCE(p_taxa_valor, 0),
    COALESCE(p_valor_liquido, 0),
    (now() AT TIME ZONE v_tz)::date,
    p_liberado_por,
    NULLIF(trim(COALESCE(p_observacao, '')), '')
  )
  RETURNING id INTO v_id;

  -- Cartão no funil, se a academia configurou o gatilho 'dayuse_novo'.
  --
  -- Sem telefone não adianta cartão: a conversa de retorno é por WhatsApp, e um
  -- cartão sem número só faria a equipe abrir e fechar sem ter o que fazer.
  IF v_tel IS NOT NULL THEN
    SELECT g.quadro_id, g.coluna_id INTO v_regra
      FROM public.academia_crm_regras g
     WHERE g.partner_id = p_partner_id AND g.gatilho = 'dayuse_novo' AND g.ativo;

    IF v_regra.quadro_id IS NOT NULL THEN
      INSERT INTO public.crm_cartoes
        (quadro_id, coluna_id, titulo, descricao, contato_nome, contato_telefone, prioridade)
      VALUES (
        v_regra.quadro_id, v_regra.coluna_id,
        COALESCE(NULLIF(trim(p_nome), ''), 'Visitante do day-use'),
        'Fez ' || COALESCE(NULLIF(p_tipo,''), 'day_use') || ' em '
          || to_char((now() AT TIME ZONE v_tz)::date, 'DD/MM/YYYY')
          || '. Falar no dia seguinte: perguntar como foi e oferecer plano.',
        COALESCE(NULLIF(trim(p_nome), ''), 'Visitante'),
        v_tel,
        'alta'
      );
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;
