-- Uma campanha pode ser remarcada para outro dia.
--
-- Em 27/08 as duas campanhas do dia ficaram prontas às 8h e ninguém disparou.
-- Às 23h não se manda mensagem para cliente, e no dia seguinte o preparador
-- cancelaria as duas por serem de "outro dia". As 11 pessoas sumiriam — e não
-- voltariam, porque amanhã elas não se encaixam em marco ativo nenhum: quem
-- vencia hoje passa a ser "venceu ontem" (sem marco) e quem faltavam 3 dias
-- passa a "faltam 2" (marco desligado).
--
-- `bot_disparos.agendado_para` já existia e nunca tinha sido usado. É
-- exatamente isto: a campanha diz para quando ela é. Melhor que mexer em
-- `created_at`, que é o registro de quando ela nasceu e não deve mentir.

/*
 * Quais campanhas podem sair AGORA — agora com hora marcada.
 *
 * Duas portas de entrada:
 *
 *   `agendado_para` preenchido — alguém marcou o dia e a hora. Vale a hora
 *   marcada e nada mais: nem a janela diária, nem a regra de "criada hoje".
 *   Quem remarcou sabia o que estava fazendo.
 *
 *   `agendado_para` vazio — o caminho de todo dia: a campanha do dia sai na
 *   hora que a academia escolheu.
 *
 * Em ambos, `d.automatico` e `cfg.avisos_envio_automatico` continuam valendo.
 * Remarcar não é autorizar: campanha escrita por gente continua sem sair
 * sozinha, mesmo com data marcada.
 */
CREATE OR REPLACE FUNCTION public.academia_avisos_a_disparar()
RETURNS TABLE(disparo_id uuid, partner_id uuid, nome text, alvos integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT d.id, cfg.partner_id, d.nome,
         (SELECT count(*)::integer FROM public.bot_disparo_alvos a
           WHERE a.disparo_id = d.id AND a.status = 'pendente')
    FROM public.bot_disparos d
    JOIN public.partner_acesso_config cfg ON cfg.partner_id = d.owner_id
   WHERE d.escopo = 'parceiro'
     AND d.status = 'rascunho'
     AND d.automatico
     AND cfg.avisos_envio_automatico
     AND (
       CASE WHEN d.agendado_para IS NOT NULL THEN
         now() >= d.agendado_para
       ELSE
         EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo')))::smallint
             >= cfg.avisos_hora
         AND EXTRACT(DOW FROM (now() AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo')))::smallint
             = ANY(cfg.avisos_dias)
         AND (d.created_at AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo'))::date
             = (now()      AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo'))::date
       END
     )
     AND EXISTS (SELECT 1 FROM public.bot_disparo_alvos a
                  WHERE a.disparo_id = d.id AND a.status = 'pendente')
   ORDER BY COALESCE(d.agendado_para, d.created_at);
$function$;

REVOKE EXECUTE ON FUNCTION public.academia_avisos_a_disparar() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.academia_avisos_a_disparar() FROM anon;
REVOKE EXECUTE ON FUNCTION public.academia_avisos_a_disparar() FROM authenticated;

/*
 * O preparador para de cancelar o que está remarcado.
 *
 * A limpeza existe para não sobrar campanha velha com texto vencido, e continua
 * valendo. Mas uma campanha com hora marcada no futuro não é sobra: é uma
 * decisão que alguém tomou. Cancelá-la seria desfazer o remarcar em silêncio,
 * na manhã seguinte, sem dizer nada.
 *
 * Única mudança em academia_avisos_preparar: a condição da limpeza.
 */
CREATE OR REPLACE FUNCTION public.academia_avisos_preparar(p_partner_id uuid)
 RETURNS TABLE(marco text, contatos integer, disparo_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD; v_texto text; v_nome text; v_disparo uuid; v_qtd integer;
  v_tz text; v_hoje date; v_hoje_br text;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  -- O dia e o da academia. O to_char(now()) que estava aqui usava a hora do
  -- servidor: em Cuiaba, depois das 20h, a campanha nascia com a data de
  -- amanha no nome.
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_hoje_br := to_char(v_hoje, 'DD/MM/YYYY');

  -- Limpeza do que sobrou de outro dia, antes de montar o de hoje.
  -- Campanha com hora marcada no futuro NAO e sobra: alguem a remarcou de
  -- proposito, e cancelar seria desfazer isso em silencio.
  FOR r IN
    SELECT d.id
      FROM public.bot_disparos d
     WHERE d.escopo = 'parceiro'
       AND d.owner_id = p_partner_id
       AND d.status = 'rascunho'
       AND (d.created_at AT TIME ZONE v_tz)::date < v_hoje
       AND (d.agendado_para IS NULL OR d.agendado_para <= now())
       AND EXISTS (SELECT 1 FROM public.academia_avisos e WHERE e.disparo_id = d.id)
  LOOP
    DELETE FROM public.academia_avisos e WHERE e.disparo_id = r.id;
    UPDATE public.bot_disparos SET status = 'cancelado', updated_at = now()
     WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT p.marco, p.valido_ate, count(*)::integer AS qtd
      FROM public.academia_avisos_pendentes(p_partner_id) p
     WHERE length(trim(COALESCE(p.telefone, ''))) >= 8
     GROUP BY p.marco, p.valido_ate
  LOOP
    SELECT mo.texto, mo.nome INTO v_texto, v_nome
      FROM public.academia_avisos_modelos mo
     WHERE mo.partner_id = p_partner_id AND mo.marco = r.marco AND mo.ativo;

    -- NULLIF junto do COALESCE: texto em branco nao e texto. Sem isso um
    -- modelo salvo vazio viraria uma campanha com mensagem em branco, que o
    -- robo dispararia sem reclamar.
    v_texto := COALESCE(NULLIF(trim(v_texto), ''), public.academia_aviso_texto_padrao(r.marco));
    v_nome  := COALESCE(NULLIF(trim(v_nome), ''), r.marco);

    IF v_texto IS NULL OR trim(v_texto) = '' THEN
      RAISE EXCEPTION 'O aviso "%" esta sem texto.', v_nome USING ERRCODE = 'check_violation';
    END IF;

    -- {data} sai aqui porque todo alvo deste marco tem o mesmo vencimento.
    -- {nome} fica para o robo resolver por pessoa no envio.
    v_texto := replace(v_texto, '{data}', to_char(r.valido_ate, 'DD/MM/YYYY'));

    -- uso='atendimento': o numero da academia. 'plataforma' e a faixa dos
    -- numeros da FitMind, e pedir por ela aqui nunca acha conexao nenhuma.
    --
    -- automatico=true: a assinatura da maquina. E o unico jeito do gancho de
    -- envio saber que esta campanha pode sair sem ninguem ler antes.
    INSERT INTO public.bot_disparos (escopo, owner_id, nome, mensagem, uso, status, automatico)
    VALUES ('parceiro', p_partner_id,
            v_nome || ' — ' || v_hoje_br,
            v_texto, 'atendimento', 'rascunho', true)
    RETURNING id INTO v_disparo;

    -- Sem ON CONFLICT (disparo_id, telefone): `disparo_id` e ao mesmo tempo
    -- coluna da tabela e parametro de saida desta funcao, e o Postgres recusa
    -- por ambiguidade. A deduplicacao de telefone e feita no DISTINCT ON --
    -- duas pessoas com o mesmo numero recebem uma mensagem so, que e o certo
    -- para WhatsApp.
    INSERT INTO public.bot_disparo_alvos (disparo_id, telefone, nome)
    SELECT DISTINCT ON (trim(p.telefone)) v_disparo, trim(p.telefone), p.nome
      FROM public.academia_avisos_pendentes(p_partner_id) p
     WHERE p.marco = r.marco AND p.valido_ate = r.valido_ate
       AND length(trim(COALESCE(p.telefone, ''))) >= 8
     ORDER BY trim(p.telefone);

    -- Só depois dos alvos: falha antes daqui deixa o aviso pendente para a
    -- próxima rodada em vez de marcar alguém que não entrou em campanha.
    INSERT INTO public.academia_avisos
      (partner_id, student_id, credencial_id, marco, valido_ate, disparo_id, telefone)
    SELECT p_partner_id, p.student_id, p.credencial_id, p.marco, p.valido_ate, v_disparo, trim(p.telefone)
      FROM public.academia_avisos_pendentes(p_partner_id) p
     WHERE p.marco = r.marco AND p.valido_ate = r.valido_ate
       AND length(trim(COALESCE(p.telefone, ''))) >= 8
    ON CONFLICT DO NOTHING;

    v_qtd := r.qtd;
    marco := r.marco; contatos := v_qtd; disparo_id := v_disparo;
    RETURN NEXT;
  END LOOP;
END;
$function$;
