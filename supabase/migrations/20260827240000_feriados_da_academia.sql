-- Os dias em que a academia não abre.
--
-- O robô já sabe o dia da semana e a hora, e por isso avisa certo às 23h de uma
-- terça. Mas no dia 7 de setembro ele diria "estamos abertos" e marcaria aula
-- experimental para uma academia de porta fechada — e quem aparecesse na porta
-- não voltaria.
--
-- A lista é da ACADEMIA, não do Brasil. Feriado nacional não fecha toda
-- academia, muitas abrem em horário reduzido; e o que fecha de verdade costuma
-- ser local (padroeira da cidade) ou particular (dedetização, reforma, férias
-- coletiva). Quem sabe é a recepção, então é ela quem escreve.

CREATE TABLE IF NOT EXISTS public.partner_feriados (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  data       date NOT NULL,
  nome       text NOT NULL,
  -- Fechado o dia inteiro, ou só mudou o horário? O robô só precisa saber se
  -- pode marcar alguém; horário reduzido continua sendo dia aberto.
  fechado    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_feriados_unico UNIQUE (partner_id, data)
);

COMMENT ON TABLE public.partner_feriados IS
  'Dias em que a academia não abre. Preenchido pela própria academia — feriado nacional não fecha todas.';

ALTER TABLE public.partner_feriados ENABLE ROW LEVEL SECURITY;

-- Mesma régua das outras tabelas da academia: quem é do parceiro enxerga e
-- mexe; o resto, não.
DROP POLICY IF EXISTS partner_feriados_membro ON public.partner_feriados;
CREATE POLICY partner_feriados_membro ON public.partner_feriados
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.partner_members m
             JOIN public.profiles p ON p.id = m.profile_id
            WHERE m.partner_id = partner_feriados.partner_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.user_id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.partner_members m
             JOIN public.profiles p ON p.id = m.profile_id
            WHERE m.partner_id = partner_feriados.partner_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.user_id = auth.uid() AND p.role = 'admin')
  );

/*
 * A academia está fechada agora?
 *
 * Devolve o nome do feriado, ou NULL se hoje é dia normal. Nome em vez de
 * booleano porque o robô consegue dizer "hoje é 7 de setembro, estamos
 * fechados" em vez de um "estamos fechados" seco que parece defeito.
 *
 * A data sai do fuso da academia: às 21h de Cuiabá o servidor em UTC já está no
 * dia seguinte, e o feriado terminaria três horas antes da meia-noite de quem
 * mora lá.
 */
CREATE OR REPLACE FUNCTION public.partner_feriado_de_hoje(p_partner_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT f.nome
    FROM public.partner_feriados f
   WHERE f.partner_id = p_partner_id
     AND f.fechado
     AND f.data = (now() AT TIME ZONE COALESCE(
           (SELECT cfg.timezone FROM public.partner_acesso_config cfg
             WHERE cfg.partner_id = p_partner_id),
           'America/Sao_Paulo'))::date
   LIMIT 1;
$function$;
