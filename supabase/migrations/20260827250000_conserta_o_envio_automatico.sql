-- Conserta o envio automático que publiquei hoje. Dois defeitos meus, achados
-- numa revisão adversarial antes de qualquer mensagem sair.
--
-- DEFEITO 1 — DUAS COISAS NA MESMA CHAVE.
-- `partner_acesso_config.avisos_automaticos` já existia desde 13/08 e significa
-- "montar os rascunhos todo dia". A tela que a liga diz, com todas as letras:
-- "Mesmo ligado, nada é enviado sozinho". Eu reaproveitei essa coluna para
-- significar "pode enviar sozinho" — e com isso marcar aquela caixa passaria a
-- ligar o envio automático em silêncio, contrariando a própria tela. Pior no
-- sentido inverso: desligar o envio mataria a montagem dos rascunhos, e a
-- academia ficaria sem campanha nenhuma sem entender por quê.
-- Coluna nova, nome novo. Uma chave, um significado.
--
-- DEFEITO 2 — AUSÊNCIA NÃO É PROVA.
-- Eu usei `criado_por IS NULL` como "foi a máquina que fez". Mas só o painel
-- ADMIN preenche `criado_por`; o painel do PARCEIRO cria campanha sem ele. Ou
-- seja: o rascunho que a recepcionista escreve à mão para conferir depois
-- também tem NULL — e sairia sozinho às 9h, para a lista inteira dela.
-- Agora a máquina MARCA o que ela fez. Marcação positiva, não dedução.

ALTER TABLE public.partner_acesso_config
  ADD COLUMN IF NOT EXISTS avisos_envio_automatico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.partner_acesso_config.avisos_envio_automatico IS
  'A academia autorizou ENVIAR sem alguém apertar o botão. Diferente de avisos_automaticos, que só monta os rascunhos.';

COMMENT ON COLUMN public.partner_acesso_config.avisos_automaticos IS
  'Monta os rascunhos do dia automaticamente. NÃO envia — quem envia é avisos_envio_automatico.';

ALTER TABLE public.bot_disparos
  ADD COLUMN IF NOT EXISTS automatico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bot_disparos.automatico IS
  'A máquina montou esta campanha e pode dispará-la. Campanha escrita por gente é sempre false.';

