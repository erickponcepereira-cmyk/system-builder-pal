-- ============================================================================
-- Cada academia manda pelo proprio numero. O do grupo vira reserva.
--
-- `bot_escolher_conexao` aceita o numero de qualquer academia do mesmo grupo,
-- e isso existe por um bom motivo: academia que divide equipamento costuma
-- dividir o chip, e ate hoje a Jessica so conseguia disparar porque saia pelo
-- numero da Estacao.
--
-- Mas a escolha era por `prioridade` e, no empate, por quem enviou MENOS hoje.
-- As duas conexoes nascem com prioridade 10. Simulado em 24/09/2026, com o
-- numero da Jessica ligado: a campanha da ESTACAO sairia pelo WhatsApp da
-- JESSICA (0 enviadas contra 6). A cobranca de mensalidade da academia chegaria
-- no aluno pelo numero pessoal da Jessica, e a cobranca do personal dela pelo
-- numero da academia -- as duas unidades existem justamente para nao misturar
-- esse dinheiro.
--
-- A correcao e uma linha na ordenacao: numero proprio primeiro, numero do grupo
-- so quando o proprio nao esta disponivel (desconectado, bloqueado ou no limite
-- do dia). Quem nao tem numero proprio continua saindo pelo do grupo, como
-- antes.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bot_escolher_conexao(_escopo text, _owner_id uuid, _uso text DEFAULT 'atendimento'::text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
  -- O numero da propria academia vem primeiro; o do grupo e reserva. Sem esta
  -- linha, o desempate por "quem enviou menos hoje" entregava a campanha de uma
  -- academia ao chip da outra.
  ORDER BY (c.owner_id IS DISTINCT FROM _owner_id),
           c.prioridade,
           CASE WHEN c.contador_dia = public.bot_dia_da_conexao(c.id) THEN c.enviadas_hoje ELSE 0 END,
           c.conectado_em NULLS LAST
  LIMIT 1
$function$;
