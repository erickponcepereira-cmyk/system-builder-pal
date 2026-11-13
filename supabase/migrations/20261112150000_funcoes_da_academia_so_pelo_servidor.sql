-- Funcoes da academia deixam de ser chamaveis com a chave anonima.
--
-- Achado em 12/11/2026. As funcoes do relatorio da academia sao SECURITY
-- DEFINER, tinham EXECUTE para PUBLIC, anon e authenticated, e nao conferem
-- acesso no corpo. O partner_id de uma academia nao e segredo (sai, por
-- exemplo, na leitura publica de partner_products). Com a chave anonima do
-- app, qualquer pessoa chamava /rest/v1/rpc/academia_relatorio_pessoas e
-- recebia nome e telefone dos alunos de qualquer academia. Provado antes de
-- corrigir, como anon, contando linhas: 1660 entradas da Estacao Funcional
-- nos ultimos 30 dias. E dado pessoal (LGPD).
--
-- A auditoria das academia_* SECURITY DEFINER achou mais tres familias:
--
-- 1. Escrita sem checagem. A pior e academia_renovar: lanca mensalidade, e
--    mensalidade e o que destrava a catraca. Qualquer um com a chave anonima
--    liberava a si mesmo (ou qualquer credencial) em qualquer academia.
--
-- 2. Funcoes que "checam" com academia_pode_ver, mas tinham EXECUTE para anon.
--    academia_pode_ver devolve TRUE quando auth.uid() e nulo - foi feito para
--    o service_role, mas anon tambem nao tem uid. Provado: como anon,
--    pode_ver = true e academia_recepcao_buscar('ana') devolveu 20 pessoas.
--    A checagem so vale para quem esta logado; para anon ela abre.
--
-- 3. Funcoes sem checagem com EXECUTE so para authenticated: qualquer aluno
--    logado chamava academia_avisos_pendentes de outra academia e via nome e
--    telefone, ou academia_dayuse_avaliar como oraculo de CPF.
--
-- Por que REVOKE e nao checagem no corpo: nenhuma destas 30 e chamada pelo
-- navegador. Todo uso do app e por server function com o cliente admin
-- (service_role) depois de autorizar()/perfilComAcessoAcademia, que e onde a
-- regra de dono/membro/master admin mora. O resto e chamado de dentro de
-- outra SECURITY DEFINER (roda como postgres), por gatilho
-- (trg_academia_mensalidade_do_pedido, academia_mensalidade_da_compra) ou pelo
-- pg_cron (job de postgres). As duas invoker que chamam alguma delas
-- (academia_modelo_secao_avisos/_planos) so tem EXECUTE para postgres e so
-- rodam de dentro de academia_modelo_aplicar. Nenhuma policy de RLS usa estas
-- funcoes (as policies usam academia_pode_ver, e sao TO authenticated).
-- Conferido em src/ (todo .rpc e string "academia_..."), em supabase/functions
-- e nas outras pastas de C:\dev.
--
-- Ficam como estao, de proposito:
-- - academia_agente_* e academia_importar_contratos: o agente da catraca chama
--   com a chave anonima e se autentica pelo segredo/token no corpo.
-- - as do aluno (academia_meu_qr, academia_minhas_academias,
--   academia_aulas_disponiveis, academia_reservar_aula, academia_minha_credencial,
--   academia_meu_rosto_enfileirar...): filtram por meu_profile_id()/auth.uid().
-- - academia_pode_ver: e usada nas policies de authenticated. O "true para
--   anon" dela continua sendo armadilha para funcao nova - ver o contexto.
--
-- Nenhum corpo muda: e so permissao. CREATE OR REPLACE preserva estes grants,
-- mas DROP + CREATE nao: o default privileges do Supabase devolve EXECUTE para
-- anon e authenticated a toda funcao nova. Quem recriar uma destas por DROP
-- tem que repetir o REVOKE.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Relatorio e listas de pessoas (nome, telefone, frequencia)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.academia_relatorio(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_relatorio(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.academia_relatorio_extra(uuid, date, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_relatorio_extra(uuid, date, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.academia_relatorio_pessoas(uuid, text, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_relatorio_pessoas(uuid, text, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.academia_relatorio_pessoas_extra(uuid, text, date, date, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_relatorio_pessoas_extra(uuid, text, date, date, date, text) TO service_role;

REVOKE ALL ON FUNCTION public.academia_relatorio_turmas(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_relatorio_turmas(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.academia_relatorio_eventos(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_relatorio_eventos(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.academia_sumidos(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_sumidos(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.academia_avisos_pendentes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_avisos_pendentes(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Escrita sem checagem
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.academia_renovar(uuid, uuid, uuid, text, numeric, jsonb, integer, uuid, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_renovar(uuid, uuid, uuid, text, numeric, jsonb, integer, uuid, text, date) TO service_role;

REVOKE ALL ON FUNCTION public.academia_crm_sincronizar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_crm_sincronizar(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.academia_avisos_semear(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_avisos_semear(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.academia_avisos_preparar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_avisos_preparar(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.academia_avisos_preparar_automaticos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_avisos_preparar_automaticos() TO service_role;

REVOKE ALL ON FUNCTION public.academia_dayuse_registrar(uuid, text, text, text, text, numeric, text, numeric, numeric, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_dayuse_registrar(uuid, text, text, text, text, numeric, text, numeric, numeric, numeric, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.academia_mensalidade_gerar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_mensalidade_gerar(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.academia_mensalidade_gerar_pedido(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_mensalidade_gerar_pedido(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.academia_evento_inscricao_gerar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_evento_inscricao_gerar(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Checam academia_pode_ver, que abre para anon
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.academia_credenciais_sugerir_vinculo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_credenciais_sugerir_vinculo(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.academia_credencial_vincular(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_credencial_vincular(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.academia_padrao_do_aluno(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_padrao_do_aluno(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.academia_recepcao_buscar(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_recepcao_buscar(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.academia_recepcao_entrada(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_recepcao_entrada(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Auxiliares internas
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.academia_crm_encaixa(uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_crm_encaixa(uuid, text, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.academia_parceiros_do_grupo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_parceiros_do_grupo(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.academia_plano_do_texto(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_plano_do_texto(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.academia_alunos_da_unidade(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_alunos_da_unidade(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.academia_caixa_conta_da_forma(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_caixa_conta_da_forma(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.academia_dayuse_avaliar(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_dayuse_avaliar(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.academia_frequencia_contador(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_frequencia_contador(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.academia_pagamento_confirmado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_pagamento_confirmado(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Trava: se alguma das 30 continuar aberta, a migration inteira volta
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_abertas text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_abertas
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN (
       'academia_relatorio', 'academia_relatorio_extra', 'academia_relatorio_pessoas',
       'academia_relatorio_pessoas_extra', 'academia_relatorio_turmas', 'academia_relatorio_eventos',
       'academia_sumidos', 'academia_avisos_pendentes',
       'academia_renovar', 'academia_crm_sincronizar', 'academia_avisos_semear',
       'academia_avisos_preparar', 'academia_avisos_preparar_automaticos', 'academia_dayuse_registrar',
       'academia_mensalidade_gerar', 'academia_mensalidade_gerar_pedido', 'academia_evento_inscricao_gerar',
       'academia_credenciais_sugerir_vinculo', 'academia_credencial_vincular', 'academia_padrao_do_aluno',
       'academia_recepcao_buscar', 'academia_recepcao_entrada',
       'academia_crm_encaixa', 'academia_parceiros_do_grupo', 'academia_plano_do_texto',
       'academia_alunos_da_unidade', 'academia_caixa_conta_da_forma', 'academia_dayuse_avaliar',
       'academia_frequencia_contador', 'academia_pagamento_confirmado')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE'));

  IF v_abertas IS NOT NULL THEN
    RAISE EXCEPTION 'Permissao fora do esperado em: %', v_abertas;
  END IF;
END $$;

COMMIT;
