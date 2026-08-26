-- O disparo do parceiro sai pelo número do parceiro. E a campanha de ontem
-- morre sozinha.
--
-- DOIS PROBLEMAS, e o primeiro estava escondido desde sempre.
--
-- 1) Nenhuma campanha de academia jamais saiu.
--
-- `academia_avisos_preparar` cravava uso='plataforma' na campanha. Mas
-- 'plataforma' é a faixa dos números DA FITMIND (escopo admin); o número da
-- academia é 'atendimento'. E `bot_escolher_conexao` exige que os dois batam:
--
--     WHERE c.uso = _uso AND c.escopo = _escopo ...
--
-- Resultado: a função devolvia NULL e a tela dizia "o número precisa estar sem
-- bloqueio, dentro do limite diário e conectado" — com o número conectado, sem
-- bloqueio e zerado no dia. A mensagem apontava para três coisas certas e
-- escondia a quarta, que era a errada.
--
-- 2) A campanha de ontem continuava disparável hoje.
--
-- A lista envelhece: quem renovou nesse meio tempo receberia cobrança
-- indevida. Agora, ao montar as de hoje, as de ontem são canceladas.
--
-- Cancelar sozinho não basta, e é aqui que quase dá errado: as marcas em
-- `academia_avisos` dizem "aviso já gerado" e impediriam essas pessoas de
-- entrar na lista de hoje. Elas ficariam sem aviso nenhum — pior do que
-- receber o de ontem. Então a marca sai junto, e quem ainda se qualificar
-- volta na campanha de hoje, com a data de hoje.
--
-- Só campanhas de aviso são tocadas. A identificação é ter marca em
-- `academia_avisos`; campanha escrita à mão pela academia não tem, e fica.

CREATE OR REPLACE FUNCTION public.academia_avisos_preparar(p_partner_id uuid)
RETURNS TABLE(marco text, contatos integer, disparo_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
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
    INSERT INTO public.bot_disparos (escopo, owner_id, nome, mensagem, uso, status)
    VALUES ('parceiro', p_partner_id,
            v_nome || ' — ' || v_hoje_br,
            v_texto, 'atendimento', 'rascunho')
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
