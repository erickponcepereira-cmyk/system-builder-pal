-- A negativa passa a guardar o motivo técnico, não só a categoria.
--
-- Em 25/08 às 18:20 a régua liberou a referência 17 e a catraca não girou:
-- ficou registrado `motivo = 'falha_catraca'` e nada mais. A mensagem do driver
-- — que diz se a porta estava ocupada, se não existe, ou se o write falhou —
-- só existia no log local do PC da academia. Sem ela, diagnosticar de fora
-- exige ir até lá.
--
-- `falha_catraca` é a categoria; `detalhe` é o que aconteceu de verdade.

ALTER TABLE public.academia_acessos_negados
  ADD COLUMN IF NOT EXISTS detalhe text;

COMMENT ON COLUMN public.academia_acessos_negados.detalhe IS
  'Mensagem crua de quem recusou: driver da catraca, leitor, ou a própria régua. Existe para diagnosticar sem estar na academia.';

CREATE OR REPLACE FUNCTION public.academia_agente_enviar(
  p_agente_id uuid, p_segredo text, p_eventos jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE a RECORD; e jsonb; cr RECORD; v_em timestamptz; v_total integer := 0;
BEGIN
  SELECT id, partner_id INTO a FROM public.academia_agentes
   WHERE id = p_agente_id AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.academia_agentes SET ultimo_contato_em = now() WHERE id = a.id;

  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_eventos, '[]'::jsonb))
  LOOP
    SELECT c.id, c.student_id INTO cr
      FROM public.academia_credenciais c
     WHERE c.partner_id = a.partner_id AND c.referencia = (e->>'ref')
     LIMIT 1;
    v_em := COALESCE((e->>'em')::timestamptz, now());

    IF COALESCE(e->>'resultado', '') = 'liberado' AND cr.id IS NOT NULL THEN
      INSERT INTO public.academia_frequencias (partner_id, student_id, credencial_id, origem, entrada_em)
      SELECT a.partner_id, cr.student_id, cr.id, COALESCE(e->>'origem', 'catraca'), v_em
       WHERE NOT EXISTS (
         SELECT 1 FROM public.academia_frequencias f
          WHERE f.partner_id = a.partner_id AND f.credencial_id = cr.id AND f.entrada_em = v_em
       );
    ELSE
      INSERT INTO public.academia_acessos_negados
        (partner_id, student_id, referencia, motivo, origem, tentado_em, detalhe)
      VALUES (a.partner_id, cr.student_id, e->>'ref',
              COALESCE(e->>'motivo', 'desconhecido'), COALESCE(e->>'origem', 'catraca'), v_em,
              -- Vem do agente. Corta em 300 para uma pilha de erro longa nao
              -- virar linha gigante no banco.
              left(NULLIF(btrim(COALESCE(e->>'detalhe','')), ''), 300));
    END IF;
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$function$;
