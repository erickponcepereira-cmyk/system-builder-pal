-- A máquina marca o que ela mesma montou.
--
-- Única mudança nesta função: a coluna `automatico` no INSERT de bot_disparos.
-- Antes, o gancho de envio deduzia autoria por `criado_por IS NULL` — e o
-- painel do parceiro cria campanha sem `criado_por`, então o rascunho que a
-- recepcionista escreve à mão também tinha NULL e sairia sozinho às 9h.
-- Ausência não é prova de autoria; agora a máquina assina o que faz.

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
  FOR r IN
    SELECT d.id
      FROM public.bot_disparos d
     WHERE d.escopo = 'parceiro'
       AND d.owner_id = p_partner_id
       AND d.status = 'rascunho'
       AND (d.created_at AT TIME ZONE v_tz)::date < v_hoje
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

/*
 * Quais campanhas podem sair AGORA — versão corrigida.
 *
 * Três mudanças em relação à de hoje de manhã:
 *
 *   `avisos_envio_automatico` em vez de `avisos_automaticos`. A antiga já
 *   significava outra coisa ("monte os rascunhos") e tem tela própria dizendo
 *   que nada é enviado sozinho.
 *
 *   `d.automatico` em vez de `criado_por IS NULL`. Marcação positiva: só sai o
 *   que a máquina assinou. Rascunho escrito por gente nunca tem essa marca.
 *
 *   `hora >= avisos_hora` em vez de `=`. Com igualdade, uma falha momentânea às
 *   9h02 apagava os avisos daquele dia inteiro — a janela era de uma hora e sem
 *   segunda chance. Agora a próxima rodada pega. Não repete, porque assim que
 *   a campanha sai ela deixa de ser rascunho.
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
     AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo')))::smallint
         >= cfg.avisos_hora
     AND EXTRACT(DOW  FROM (now() AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo')))::smallint
         = ANY(cfg.avisos_dias)
     AND (d.created_at AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo'))::date
         = (now()      AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo'))::date
     AND EXISTS (SELECT 1 FROM public.bot_disparo_alvos a
                  WHERE a.disparo_id = d.id AND a.status = 'pendente')
   ORDER BY d.created_at;
$function$;

-- SECURITY DEFINER sem REVOKE é porta aberta: pelo PostgREST, qualquer visitante
-- não autenticado chamaria esta função e leria o nome e o tamanho das campanhas
-- de TODAS as academias do sistema. Quem precisa dela é o gancho, que roda com
-- a chave de serviço.
REVOKE EXECUTE ON FUNCTION public.academia_avisos_a_disparar() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.academia_avisos_a_disparar() FROM anon;
REVOKE EXECUTE ON FUNCTION public.academia_avisos_a_disparar() FROM authenticated;
