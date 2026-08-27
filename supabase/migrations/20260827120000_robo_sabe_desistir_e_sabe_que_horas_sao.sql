-- O robô ganha noção de tentativa.
--
-- Quando não entendia a resposta, ele repetia as opções — para sempre. Quem
-- digitou algo fora do menu ficava num laço até desistir e fechar o WhatsApp,
-- e a academia nunca sabia que existiu uma conversa.
--
-- Com o contador, ele repete UMA vez e depois oferece o atendente humano.
ALTER TABLE public.bot_conversas
  ADD COLUMN IF NOT EXISTS tentativas_passo integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bot_conversas.tentativas_passo IS
  'Quantas vezes seguidas a pessoa respondeu algo que nao casou com nenhuma opcao do passo atual. Zera a cada acerto.';
