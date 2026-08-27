-- Os avisos passam a sair sozinhos — quando a academia mandar.
--
-- `academia_avisos_preparar` roda às 8h e monta as campanhas em rascunho desde
-- 25/08. Ninguém aperta o botão: hoje mesmo ficaram duas prontas, "Faltam 3
-- dias" e "Vence hoje", com 11 pessoas que não foram avisadas.
--
-- DESLIGADO POR PADRÃO, e é de propósito. Mensagem automática errada não é um
-- bug que se conserta depois: é o chip da academia bloqueado pelo WhatsApp.
-- Quem liga é a academia, sabendo o que vai sair.

ALTER TABLE public.partner_acesso_config
  ADD COLUMN IF NOT EXISTS avisos_automaticos boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avisos_hora        smallint NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS avisos_dias        smallint[] NOT NULL DEFAULT '{1,2,3,4,5}';

COMMENT ON COLUMN public.partner_acesso_config.avisos_automaticos IS
  'A academia autorizou o envio sem alguém apertar o botão. Falso por padrão.';
COMMENT ON COLUMN public.partner_acesso_config.avisos_hora IS
  'Hora local (0-23) em que os avisos do dia saem.';
COMMENT ON COLUMN public.partner_acesso_config.avisos_dias IS
  'Dias em que pode enviar, padrão EXTRACT(DOW): 0=domingo … 6=sábado. Vazio = nenhum.';

/*
 * Quais campanhas podem sair AGORA.
 *
 * Toda a decisão de tempo mora aqui, em SQL, pelo fuso de cada academia. Em
 * TypeScript ela sairia de `new Date()` do servidor, que roda em UTC — o mesmo
 * engano que fazia a cota do chip virar às 20h de Cuiabá.
 *
 * Três travas, e cada uma existe por um motivo diferente:
 *
 *   `criado_por IS NULL` — só campanha feita pela máquina. Rascunho que uma
 *   pessoa está escrevendo tem `criado_por` preenchido e NUNCA sai sozinho:
 *   disparar o texto pela metade de alguém seria pior que não disparar nada.
 *
 *   `created_at` de hoje — aviso de vencimento é notícia do dia. Uma campanha
 *   esquecida de três dias atrás avisaria gente que já renovou.
 *
 *   a janela de hora e dia — ninguém recebe cobrança da academia às 6 da manhã
 *   de domingo.
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
     AND d.criado_por IS NULL
     AND cfg.avisos_automaticos
     AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo')))::smallint
         = cfg.avisos_hora
     AND EXTRACT(DOW  FROM (now() AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo')))::smallint
         = ANY(cfg.avisos_dias)
     AND (d.created_at AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo'))::date
         = (now()      AT TIME ZONE COALESCE(cfg.timezone,'America/Sao_Paulo'))::date
     AND EXISTS (SELECT 1 FROM public.bot_disparo_alvos a
                  WHERE a.disparo_id = d.id AND a.status = 'pendente')
   ORDER BY d.created_at;
$function$;
