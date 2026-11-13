-- Glaucia Cristina Simi (ref 29) e Jozilene Lima Marinho (ref 271) passam da
-- Jessica para a Estacao Funcional, a pedido do Erick em 12/11/2026.
--
-- E o caminho inverso do de 14/09 (20260915170000), pela mesma
-- `academia_transferir_credenciais`: a pessoa e de uma academia so, e o que
-- ela gerou vai junto - mensalidades, frequencias, barradas e avisos. O leitor
-- e o mesmo (grupo Estacao + Jessica), entao o rosto e a catraca nao mudam.
--
-- Ensaiado em transacao desfeita antes de aplicar:
--   credenciais 2, mensalidades 5, frequencias 37, barradas 1, avisos 3,
--   envios de rosto 0, cartoes de CRM arquivados 0;
--   pessoas ativas no grupo: 467 antes e depois;
--   regua da Estacao: Jozilene liberada ate 16/11/2026, Glaucia bloqueada
--   (venceu em 06/11/2026) - o mesmo que a Jessica dizia.
--
-- As mensalidades sao `origem = 'externa'` (pix recebido fora da plataforma):
-- mudam de relatorio, nao mexem em carteira nem razao. R$ 425 de setembro e
-- outubro saem do relatorio da Jessica e entram no da Estacao.

BEGIN;

SELECT public.academia_transferir_credenciais(
  'afcad56d-247c-48b7-bed0-7ea0ee30ae08'::uuid,  -- Jessica
  '646c99dd-23cc-4da5-ba96-e52cfb1384b4'::uuid,  -- Estacao Funcional
  ARRAY[
    'fc053423-6b7d-4bf3-aa8a-25b7140f1991',      -- 29  Glaucia Cristina Simi
    '3dbf97ec-b5f7-4c0b-9162-4ba66979df36'       -- 271 Jozilene Lima Marinho
  ]::uuid[],
  'Transferida da Jessica para a Estacao Funcional em 12/11/2026, a pedido do Erick.'
);

COMMIT;
