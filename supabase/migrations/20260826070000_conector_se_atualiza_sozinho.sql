-- O conector de WhatsApp passa a se atualizar sozinho, como o agente da catraca.
--
-- Até aqui cada correção exigia alguém ir até a academia — ou o Erick copiar um
-- arquivo à mão. Em 26/08 três bugs saíram no mesmo dia (JID sem o 55, envio
-- em duplicata, alvo travado em "enfileirado") e dois deles só chegavam ao PC
-- da recepção por cópia manual.
--
-- O lançador (FitMindConector.exe) já reiniciava no código de saída 42 desde a
-- primeira versão; faltava só o programa saber quando pedir.
--
-- Tabela separada da `agente_versoes` de propósito: uma versão ruim do agente
-- não pode derrubar os conectores, e vice-versa. São dois programas, dois
-- ciclos de publicação.
CREATE TABLE IF NOT EXISTS public.conector_versoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  versao     text NOT NULL UNIQUE,
  arquivos   jsonb NOT NULL,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sem policy nenhuma: o conector não fala com o banco, fala com a API, que usa
-- service role. Ninguém mais precisa ler daqui — e o conteúdo é código que roda
-- no PC da academia.
ALTER TABLE public.conector_versoes ENABLE ROW LEVEL SECURITY;

-- Para a tela saber qual versão cada conector está rodando, do mesmo jeito que
-- o painel da catraca mostra a do agente.
ALTER TABLE public.bot_conexoes ADD COLUMN IF NOT EXISTS versao text;

COMMENT ON COLUMN public.bot_conexoes.versao IS
  'Versao do conector rodando no PC da academia. Preenchida por /api/bot/atualizacao a cada verificacao.';
