-- A conversa passa a guardar o endereço original do WhatsApp.
--
-- Mensagem que CHEGA vinha com o endereço em `remoteJid`, e o conector guardava
-- só os dígitos dele. Isso funcionava enquanto todo mundo era
-- `5565999990000@s.whatsapp.net`. Só que o WhatsApp passou a endereçar parte
-- das conversas por LID — `103843987759126@lid` — e os dígitos disso não são
-- telefone de ninguém.
--
-- Resultado: em 26/08 o Erick respondeu "oi" pela aba Conversas e a mensagem
-- morreu com "o numero 103843987759126 nao tem WhatsApp". A campanha funcionava
-- (ali o telefone vem do cadastro, não do JID) e a resposta não.
--
-- Guardar o JID inteiro resolve sem depender de adivinhar formato: para
-- responder, devolve-se a mensagem ao MESMO endereço de onde ela veio.
ALTER TABLE public.bot_conversas ADD COLUMN IF NOT EXISTS jid text;

COMMENT ON COLUMN public.bot_conversas.jid IS
  'Endereco do WhatsApp de onde a conversa veio (5565...@s.whatsapp.net ou ...@lid). E para ele que a resposta volta. Nulo em conversa criada pelo nosso lado, que sai por telefone.';

CREATE INDEX IF NOT EXISTS bot_conversas_jid ON public.bot_conversas (conexao_id, jid)
  WHERE jid IS NOT NULL;
