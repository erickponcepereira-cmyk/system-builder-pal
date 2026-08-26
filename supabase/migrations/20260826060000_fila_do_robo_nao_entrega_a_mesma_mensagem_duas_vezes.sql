-- A fila do robô para de entregar a mesma mensagem duas vezes.
--
-- `/api/bot/fila` devolvia toda mensagem pendente e não marcava nada. O
-- conector busca a cada 3 segundos, mas uma rodada demora mais — só o
-- "digitando" leva até 6s por mensagem. A rodada seguinte começava por cima da
-- anterior, pegava a MESMA mensagem ainda pendente, e mandava de novo.
--
-- Em 26/08 uma mensagem saiu quatro vezes: 7:38:34, :35, :36 e :39. O conector
-- ganhou uma trava de reentrância, mas ela vale para UM conector. Esta marca
-- vale para qualquer um, e é a que protege o cliente de receber a mesma
-- cobrança quatro vezes.
--
-- Dois minutos, e não um bloqueio definitivo: se o conector morrer entre pegar
-- e confirmar, a mensagem volta para a fila sozinha. Bloqueio permanente
-- exigiria alguém para destravar, e ninguém vai olhar isso.
ALTER TABLE public.bot_mensagens
  ADD COLUMN IF NOT EXISTS entregue_em timestamptz;

COMMENT ON COLUMN public.bot_mensagens.entregue_em IS
  'Quando esta mensagem foi entregue ao conector para envio. Serve de trava: a fila nao a devolve de novo por 2 minutos. Nulo = nunca saiu para o conector.';
