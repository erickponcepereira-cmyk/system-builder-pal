-- Um modelo que cria a academia VAZIA.
--
-- Até aqui existia um modelo só, extraído da Estação. Aplicá-lo numa academia
-- nova traz junto 6 planos com os preços da Estação, 6 turmas de 05:00 às
-- 19:30 e 8 avisos -- e, o que é pior, com `avisos_envio_automatico = true`,
-- porque é assim que a Estação roda. Numa academia recém-criada isso é envio
-- automático ligado num painel sem WhatsApp conectado.
--
-- Quem está implantando uma academia nova quer o painel em branco para
-- configurar, que foi como a da Jessica nasceu. Este modelo cria só a linha de
-- `partner_acesso_config` -- que é o que faz a aba Academia aparecer para o
-- dono -- e mais nada.
--
-- As escolhas do config, e por quê:
--
--   validacao_frequencia = 'ambos'   Aceita leitor facial E QR code. O CHECK da
--                                    coluna permite 'catraca' | 'qrcode' |
--                                    'ambos'; 'ambos' é o que não fecha porta
--                                    para nenhum dos dois enquanto o dono ainda
--                                    não decidiu o equipamento.
--
--   avisos_envio_automatico = false  E `avisos_automaticos` também. Academia
--   avisos_automaticos      = false  nova não tem número conectado nem lista
--                                    revisada. Ligar depois é um clique; um
--                                    disparo indevido no primeiro dia não se
--                                    desfaz.
--
--   regra_dayuse = 'desativado'      Day-use é decisão comercial de cada
--                                    academia, com preço e regra próprios. O
--                                    padrão silencioso é não oferecer.
--
--   regime_turma = 'livre'           O mesmo padrão da coluna. Quem cobra
--                                    presença por turma marcada troca depois,
--                                    em Configurações.
--
--   timezone = 'America/Cuiaba'      As três academias são de Mato Grosso. Está
--                                    aqui para ser trocado, não para ser
--                                    presumido -- fuso errado desloca todo
--                                    relatório e toda régua de vencimento.
--
-- Idempotente pelo nome: aplicar esta migration de novo não cria um segundo.
INSERT INTO public.academia_modelos (nome, descricao, conteudo, ativo)
SELECT
  'Academia nova (em branco)',
  'Cria so a configuracao, sem plano, sem aviso e sem turma — o painel nasce vazio para o dono preencher. Envio automatico DESLIGADO de proposito: academia recem-criada nao tem WhatsApp conectado, e aviso automatico ligado em painel vazio dispara para ninguem ou para quem nao devia. Validacao em "ambos", que aceita leitor facial e QR code.',
  jsonb_build_object(
    'versao', 1,
    'origem', jsonb_build_object(
      'nome', 'Modelo em branco',
      'partner_id', NULL,
      'extraido_em', now()
    ),
    'config', jsonb_build_object(
      'timezone',                'America/Cuiaba',
      'dias_carencia',           2,
      'exige_senha_liberacao',   false,
      'regra_dayuse',            'desativado',
      'modelo_catraca',          NULL,
      'validacao_frequencia',    'ambos',
      'frequencia_conta',        'dia',
      'frequencia_periodo',      'vitalicio',
      'frequencia_meta',         10,
      'avisos_hora',             9,
      'avisos_dias',             jsonb_build_array(1,2,3,4,5),
      'avisos_automaticos',      false,
      'avisos_envio_automatico', false,
      'dias_sumido',             60,
      'tolerancia_aula_min',     30,
      'regime_turma',            'livre'
    ),
    'planos', '[]'::jsonb,
    'avisos', '[]'::jsonb,
    'turmas', '[]'::jsonb
  ),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.academia_modelos WHERE nome='Academia nova (em branco)');
