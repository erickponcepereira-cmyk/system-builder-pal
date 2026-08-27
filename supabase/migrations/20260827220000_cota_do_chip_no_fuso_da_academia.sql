-- A cota diária do chip passa a virar à meia-noite DA ACADEMIA.
--
-- `bot_contar_envio` e `bot_escolher_conexao` usavam `CURRENT_DATE`. O banco
-- roda em UTC, então o "dia" virava às 20h no horário de Cuiabá — bem no meio
-- do horário nobre de uma academia.
--
-- Isso não é detalhe de relatório: o limite diário existe para o WhatsApp não
-- bloquear o chip, e o WhatsApp não faz ideia do que é meia-noite UTC. Uma
-- rajada entre 19h50 e 20h10 mandaria o DOBRO do limite em vinte minutos, e o
-- contador registraria como se fossem dois dias diferentes. Medido em 27/08:
-- `contador_dia` marcava 27 enquanto as 6 mensagens tinham saído dia 26.

/*
 * Que dia é hoje para esta conexão.
 *
 * A conexão de parceiro tem `owner_id` = partner_id, e é lá que mora o fuso.
 * Sem configuração, São Paulo — o mesmo padrão que a catraca já usa, para não
 * existirem duas respostas diferentes para "que horas são" no mesmo sistema.
 */
CREATE OR REPLACE FUNCTION public.bot_dia_da_conexao(_conexao_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT (now() AT TIME ZONE COALESCE(
           (SELECT cfg.timezone FROM public.partner_acesso_config cfg
             JOIN public.bot_conexoes c ON c.owner_id = cfg.partner_id
            WHERE c.id = _conexao_id),
           'America/Sao_Paulo'))::date;
$function$;

CREATE OR REPLACE FUNCTION public.bot_contar_envio(_conexao_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
  UPDATE public.bot_conexoes
     SET enviadas_hoje = CASE
           WHEN contador_dia = public.bot_dia_da_conexao(_conexao_id) THEN enviadas_hoje + 1
           ELSE 1 END,
         contador_dia = public.bot_dia_da_conexao(_conexao_id)
   WHERE id = _conexao_id;
$function$;

-- Mesmo dia, mesma regra, do outro lado: quem escolhe o chip precisa concordar
-- com quem conta o envio, senão um libera o que o outro ja considerou gasto.
CREATE OR REPLACE FUNCTION public.bot_escolher_conexao(
  _escopo text,
  _owner_id uuid,
  _uso text DEFAULT 'atendimento'::text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT c.id FROM public.bot_conexoes c
  WHERE c.uso = _uso AND c.escopo = _escopo
    AND (
      c.owner_id = _owner_id
      -- Academias que dividem equipamento dividem tambem o numero. Cada uma
      -- monta as proprias campanhas; o chip que sai e o mesmo.
      OR (_owner_id IS NOT NULL AND c.owner_id IN (
            SELECT g.partner_id FROM public.academia_parceiros_do_grupo(_owner_id) g))
      OR (_owner_id IS NULL AND c.owner_id IS NULL)
    )
    AND c.arquivado_em IS NULL AND c.bloqueado_em IS NULL
    AND c.status = 'conectado' AND c.visto_em > now() - interval '5 minutes'
    AND (c.limite_diario IS NULL
      OR c.contador_dia IS DISTINCT FROM public.bot_dia_da_conexao(c.id)
      OR c.enviadas_hoje < c.limite_diario)
  ORDER BY c.prioridade,
           CASE WHEN c.contador_dia = public.bot_dia_da_conexao(c.id) THEN c.enviadas_hoje ELSE 0 END,
           c.conectado_em NULLS LAST
  LIMIT 1
$function$;
