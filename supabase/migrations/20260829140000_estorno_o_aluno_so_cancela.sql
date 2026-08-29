-- ============================================================================
-- Pedido de estorno: o aluno pede e cancela; quem decide e o admin.
--
-- `return_requests` existe desde 04/07 com quatro politicas e nunca foi usada
-- por nenhuma tela — 0 linhas. Ao construir a UI em cima dela, a politica de
-- UPDATE apareceu como um buraco: ela so testa QUEM (`requested_by` e meu),
-- sem WITH CHECK, entao o proprio solicitante podia mudar QUALQUER coluna.
-- Inclusive `status` para 'approved' e `refund_amount` para o que quisesse.
--
-- O nome dela ja dizia a intencao certa — "requester can cancel own returns".
-- Esta migration faz a politica cumprir o proprio nome.
--
-- Fica valendo:
--   o aluno cria (INSERT, ja estava certo), le o dele (SELECT, ja estava certo)
--   e so pode CANCELAR, e so enquanto ninguem decidiu ainda.
--   o admin continua com ALL.
-- ============================================================================

DROP POLICY IF EXISTS "requester can cancel own returns" ON public.return_requests;

CREATE POLICY "requester can cancel own returns"
  ON public.return_requests
  FOR UPDATE
  USING (
    requested_by IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    -- Decisao tomada nao volta atras pela mao de quem pediu.
    AND status IN ('requested', 'under_review')
  )
  WITH CHECK (
    requested_by IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND status = 'cancelled'
  );

COMMENT ON POLICY "requester can cancel own returns" ON public.return_requests IS
  'O solicitante so pode levar o proprio pedido para cancelled, e so enquanto ele estiver em requested/under_review. Quem aprova, rejeita ou marca como estornado e o admin.';

-- ----------------------------------------------------------------------------
-- Um pedido aberto por pedido de compra. Sem isto, tocar duas vezes no botao
-- abre dois processos para a mesma venda e o admin decide duas vezes.
-- Parcial de proposito: depois de cancelado ou rejeitado, pedir de novo e
-- legitimo — a pessoa pode ter mandado o motivo errado.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS return_requests_um_aberto_por_pedido
  ON public.return_requests (order_id, order_type)
  WHERE status IN ('requested', 'under_review', 'approved');
