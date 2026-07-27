-- =====================================================================
-- FITMIND - DIAGNOSTICO FINANCEIRO
-- Cole no SQL Editor do Supabase e rode bloco por bloco.
-- TUDO SOMENTE LEITURA. Nenhum comando altera dados.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCO 1 - Volume real: o que esta vivo e quanto e teste
-- ---------------------------------------------------------------------
SELECT 'transactions'         AS tabela, COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_test) AS testes,
       ROUND(SUM(gross_amount)::numeric, 2)                      AS valor_total,
       ROUND(SUM(gross_amount) FILTER (WHERE is_test)::numeric,2) AS valor_teste
FROM transactions
UNION ALL
SELECT 'store_orders', COUNT(*), COUNT(*) FILTER (WHERE is_test),
       ROUND(SUM(total_amount)::numeric,2),
       ROUND(SUM(total_amount) FILTER (WHERE is_test)::numeric,2)
FROM store_orders
UNION ALL
SELECT 'commissions', COUNT(*), COUNT(*) FILTER (WHERE is_test),
       ROUND(SUM(amount)::numeric,2),
       ROUND(SUM(amount) FILTER (WHERE is_test)::numeric,2)
FROM commissions
UNION ALL
SELECT 'mercadopago_payments', COUNT(*), COUNT(*) FILTER (WHERE is_test),
       ROUND(SUM(amount)::numeric,2),
       ROUND(SUM(amount) FILTER (WHERE is_test)::numeric,2)
FROM mercadopago_payments
ORDER BY tabela;


-- ---------------------------------------------------------------------
-- BLOCO 2 - As seis carteiras: quantas linhas e quanto dinheiro cada uma
-- ---------------------------------------------------------------------
SELECT 'wallets' AS carteira, COUNT(*) AS linhas,
       ROUND(SUM(COALESCE(available_balance,0))::numeric,2) AS disponivel,
       ROUND(SUM(COALESCE(total_earned,0))::numeric,2)      AS total_ganho
FROM wallets
UNION ALL
SELECT 'student_wallets', COUNT(*),
       ROUND(SUM(COALESCE(available_balance,0))::numeric,2),
       ROUND(SUM(COALESCE(total_earned,0))::numeric,2)
FROM student_wallets
UNION ALL
SELECT 'professional_wallets', COUNT(*),
       ROUND(SUM(available_balance)::numeric,2),
       ROUND(SUM(total_earned)::numeric,2)
FROM professional_wallets
UNION ALL
SELECT 'professor_wallets', COUNT(*),
       ROUND(SUM(available_balance)::numeric,2),
       ROUND(SUM(total_earned)::numeric,2)
FROM professor_wallets
UNION ALL
SELECT 'nutritionist_wallets', COUNT(*),
       ROUND(SUM(available_balance)::numeric,2),
       ROUND(SUM(total_earned)::numeric,2)
FROM nutritionist_wallets
UNION ALL
SELECT 'partner_wallets', COUNT(*),
       ROUND(SUM(available_balance)::numeric,2),
       ROUND(SUM(total_earned)::numeric,2)
FROM partner_wallets
ORDER BY carteira;


-- ---------------------------------------------------------------------
-- BLOCO 3 - *** O TESTE DA HIPOTESE ***
-- Quanto dinheiro de TESTE foi creditado como comissao.
-- Se vier valor > 0, esse dinheiro esta hoje dentro das carteiras
-- que nao tem coluna is_test e nao ha como separa-lo.
-- ---------------------------------------------------------------------
SELECT c.beneficiary_profile_id,
       COUNT(*)                        AS comissoes_teste,
       ROUND(SUM(c.amount)::numeric,2) AS valor_teste_creditado
FROM commissions c
WHERE c.is_test = true
GROUP BY c.beneficiary_profile_id
ORDER BY valor_teste_creditado DESC NULLS LAST
LIMIT 40;


-- ---------------------------------------------------------------------
-- BLOCO 4 - Divergencia: saldo gravado x soma das comissoes validas
-- Cada linha aqui e uma carteira que nao bate.
-- ---------------------------------------------------------------------
WITH ganho_real AS (
  SELECT beneficiary_profile_id AS pid,
         SUM(amount) FILTER (WHERE is_test = false) AS ganho_valido
  FROM commissions
  GROUP BY beneficiary_profile_id
)
SELECT w.profile_id,
       ROUND(w.total_earned::numeric,2)                                AS gravado_na_carteira,
       ROUND(COALESCE(g.ganho_valido,0)::numeric,2)                    AS deveria_ser,
       ROUND((w.total_earned - COALESCE(g.ganho_valido,0))::numeric,2) AS diferenca
FROM professor_wallets w
LEFT JOIN ganho_real g ON g.pid = w.profile_id
WHERE ROUND((w.total_earned - COALESCE(g.ganho_valido,0))::numeric,2) <> 0
ORDER BY ABS(w.total_earned - COALESCE(g.ganho_valido,0)) DESC
LIMIT 40;


-- ---------------------------------------------------------------------
-- BLOCO 5 - Orfaos: comissao viva apontando para transacao que sumiu
-- (rastro dos DELETE parciais do admin-test-sales)
-- ---------------------------------------------------------------------
SELECT COUNT(*) AS comissoes_orfas,
       ROUND(SUM(c.amount)::numeric,2) AS valor_orfao
FROM commissions c
LEFT JOIN transactions t ON t.id = c.transaction_id
WHERE c.transaction_id IS NOT NULL
  AND t.id IS NULL;


-- ---------------------------------------------------------------------
-- BLOCO 6 - Pagou no MP mas o pedido nao recebeu baixa
-- (cliente pagou e nao recebeu = risco de reclamacao e chargeback)
-- ---------------------------------------------------------------------
SELECT COUNT(*) AS aprovados_sem_baixa,
       ROUND(SUM(mp.amount)::numeric,2) AS valor
FROM mercadopago_payments mp
LEFT JOIN store_orders so ON so.id::text = mp.source_id
WHERE mp.status = 'approved'
  AND mp.is_test = false
  AND mp.source_kind = 'store_order'
  AND (so.id IS NULL OR so.paid_at IS NULL);


-- ---------------------------------------------------------------------
-- BLOCO 7 - Os dois sistemas de assinatura convivendo
-- ---------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM subscriptions)                          AS subscriptions,
  (SELECT COUNT(*) FROM subscriptions WHERE is_test)            AS subscriptions_teste,
  (SELECT COUNT(*) FROM user_subscriptions)                     AS user_subscriptions,
  (SELECT COUNT(*) FROM user_subscriptions WHERE is_test)       AS user_subs_teste,
  (SELECT COUNT(*) FROM subscriptions s
     JOIN user_subscriptions us ON us.user_id = s.student_id)   AS usuarios_nos_dois;


-- ---------------------------------------------------------------------
-- BLOCO 8 - LGPD: senhas em texto puro e dados sensiveis parados
-- ---------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM test_accounts)        AS contas_com_senha_em_texto,
  (SELECT COUNT(*) FROM saved_payment_cards)  AS cartoes_salvos,
  (SELECT COUNT(*) FROM lgpd_access_log)      AS registros_log_lgpd,
  (SELECT COUNT(*) FROM terms_acceptances)    AS aceites_de_termos,
  (SELECT COUNT(*) FROM profiles)             AS total_de_pessoas;


-- ---------------------------------------------------------------------
-- BLOCO 9 - Tabelas mortas (0 referencias no codigo): tem dado dentro?
-- ---------------------------------------------------------------------
SELECT 'course_teacher_commissions' AS tabela, COUNT(*) AS linhas FROM course_teacher_commissions
UNION ALL SELECT 'fitcoin_ledger',                   COUNT(*) FROM fitcoin_ledger
UNION ALL SELECT 'points_redeem_orders',             COUNT(*) FROM points_redeem_orders
UNION ALL SELECT 'professional_coupons',             COUNT(*) FROM professional_coupons
UNION ALL SELECT 'saved_payment_cards',              COUNT(*) FROM saved_payment_cards
UNION ALL SELECT 'subscription_payment_log',         COUNT(*) FROM subscription_payment_log
UNION ALL SELECT 'partner_product_order_status_log', COUNT(*) FROM partner_product_order_status_log;
