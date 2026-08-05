-- DISPAROS — envio espaçado sem precisar de agendador.
--
-- O conector busca a fila de tempos em tempos. Se enfileirássemos 200 mensagens
-- de uma vez, ele mandaria tudo em rajada — que é exatamente o que faz o
-- WhatsApp bloquear o número.
--
-- A solução: cada mensagem ganha uma hora própria (`agendado_para`), e o
-- endpoint da fila só entrega as que já venceram. O espaçamento acontece
-- sozinho, sem processo em segundo plano e sem cron.
--
-- Não toca em dinheiro. Registrado em docs/REGISTRO-MIGRATIONS.md.

ALTER TABLE public.bot_mensagens ADD COLUMN IF NOT EXISTS agendado_para TIMESTAMPTZ;

-- a fila passa a considerar a hora agendada; nulo = manda assim que puder
DROP INDEX IF EXISTS public.idx_bot_mensagens_fila;
CREATE INDEX IF NOT EXISTS idx_bot_mensagens_fila
  ON public.bot_mensagens(agendado_para, created_at)
  WHERE status = 'pendente';

-- de qual disparo veio a mensagem, para a tela mostrar o andamento
ALTER TABLE public.bot_mensagens ADD COLUMN IF NOT EXISTS disparo_id UUID;

DO $do$ BEGIN
  ALTER TABLE public.bot_mensagens
    ADD CONSTRAINT bot_mensagens_disparo_fk
    FOREIGN KEY (disparo_id) REFERENCES public.bot_disparos(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS idx_bot_mensagens_disparo
  ON public.bot_mensagens(disparo_id) WHERE disparo_id IS NOT NULL;
