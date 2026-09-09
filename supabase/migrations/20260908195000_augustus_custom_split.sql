-- Liga o `custom_split` nos 3.785 exames do Augustus.
--
-- Erro da importação de 03/09: os produtos entraram com `skip_tax`,
-- `system_fee_pct_override` (15/10/7 por faixa) e `network_l*_pct_override`,
-- mas sem `custom_split`. Em `create_partner_product_order` essa flag é o
-- portão de TODOS esses campos:
--
--   v_sys_pct := CASE WHEN custom_split AND system_fee_pct_override IS NOT NULL ...
--
-- Sem ela os overrides são inertes e a venda cai no padrão de 7%. Os 3.381
-- produtos das faixas de 15% e 10% cobrariam 7%, e o prestador receberia mais
-- do que a tabela dele — R$ 31.303 de taxa de sistema a menos para a FitMind
-- se o catálogo inteiro fosse vendido uma vez.
--
-- Seguro de ligar: nenhum desses produtos tem `system_fee_amount_override` nem
-- `creator_pct_override`, que são os outros dois campos sob o mesmo portão.
-- Nenhuma venda tinha ocorrido.
UPDATE public.professional_products
   SET custom_split = true
 WHERE section_id = '1051044b-905e-4e0b-b189-cb6d91b499d1'
   AND skip_tax
   AND COALESCE(custom_split, false) = false
   AND system_fee_amount_override IS NULL
   AND creator_pct_override IS NULL;
