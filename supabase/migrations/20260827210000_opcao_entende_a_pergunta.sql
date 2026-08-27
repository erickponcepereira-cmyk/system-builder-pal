-- O robô passa a entender a pergunta, não só o número do menu.
--
-- Hoje, 12:24, uma cliente real perguntou "Qual valor para 3 dias da semana?" —
-- a pergunta mais comum de uma academia, e a resposta está no menu. O robô
-- respondeu "Não entendi". O casamento era `resposta.includes(gatilho)` com
-- gatilhos de UM dígito, o que além de não entender frase nenhuma casava por
-- acidente: "o plano de 145 reais" contém "1", "4" e "5".
--
-- `sinonimos` é como a opção diz por que outros nomes ela atende. Fica no banco,
-- não no código, porque quem sabe como o cliente pergunta é a academia.

ALTER TABLE public.bot_opcoes
  ADD COLUMN IF NOT EXISTS sinonimos text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.bot_opcoes.sinonimos IS
  'Como o cliente pode pedir esta opção com as palavras dele. Casado por frase inteira, sem acento e sem maiúscula.';

-- Os sinônimos do menu da Estação, tirados do que as pessoas realmente
-- escreveram nas conversas de 25 a 27/08.
UPDATE public.bot_opcoes o
   SET sinonimos = ARRAY[
     'plano','planos','preco','precos','valor','valores','quanto custa','quanto e',
     'quanto fica','mensalidade','mensalidades','tabela','quanto','custo'
   ]
 WHERE o.rotulo ILIKE '%plano%'
   AND EXISTS (SELECT 1 FROM public.bot_passos p JOIN public.bot_fluxos f ON f.id=p.fluxo_id
                WHERE p.id=o.passo_id AND f.escopo='parceiro');

UPDATE public.bot_opcoes o
   SET sinonimos = ARRAY[
     'aula','aula experimental','experimental','agendar','marcar','agendamento',
     'testar','teste','conhecer a academia','visitar','fazer uma aula','treinar'
   ]
 WHERE o.rotulo ILIKE '%experimental%'
   AND EXISTS (SELECT 1 FROM public.bot_passos p JOIN public.bot_fluxos f ON f.id=p.fluxo_id
                WHERE p.id=o.passo_id AND f.escopo='parceiro');

-- Os horários também: quem responde "as 6" ou "de manha" não digita o número.
UPDATE public.bot_opcoes SET sinonimos = ARRAY['05','5h','05h','cinco','cinco horas']       WHERE rotulo = '05h às 06h';
UPDATE public.bot_opcoes SET sinonimos = ARRAY['06','6h','06h','seis','seis horas']         WHERE rotulo = '06h às 07h';
UPDATE public.bot_opcoes SET sinonimos = ARRAY['07','7h','07h','sete','sete horas']         WHERE rotulo = '07h às 08h';
UPDATE public.bot_opcoes SET sinonimos = ARRAY['17 30','17h30','5 30','cinco e meia']       WHERE rotulo = '17h30 às 18h30';
UPDATE public.bot_opcoes SET sinonimos = ARRAY['18 30','18h30','6 30','seis e meia']        WHERE rotulo = '18h30 às 19h30';
UPDATE public.bot_opcoes SET sinonimos = ARRAY['19 30','19h30','7 30','sete e meia']        WHERE rotulo = '19h30 às 20h30';
