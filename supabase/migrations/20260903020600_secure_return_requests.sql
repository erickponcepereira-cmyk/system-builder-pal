-- ============================================================================
-- Estornos: toda escrita passa por RPCs estreitas, após a migration Lovable 20260903015016.
--
-- Antes desta migration, uma pessoa autenticada podia apontar o INSERT para o
-- UUID de uma compra alheia. O trigger de return_requests então marcava o
-- release_status dessa venda como bloqueado. O UPDATE usado para cancelar também aceitava mudanças
-- laterais em colunas que pertencem à decisão administrativa.
--
-- As RPCs abaixo validam a compra na mesma transação, derivam os campos
-- financeiros no servidor e expõem somente as transições necessárias à UI.
-- ATENÇÃO operacional: esta migration protege a integridade do pedido, mas o
-- release_status bloqueado ainda precisa ser ligado aos jobs/ledgers que
-- liberam dinheiro. Do mesmo modo, `refunded` só confirma uma operação externa.
-- ============================================================================

DROP POLICY IF EXISTS "requester can create own returns" ON public.return_requests;
DROP POLICY IF EXISTS "requester can cancel own returns" ON public.return_requests;
DROP POLICY IF EXISTS "admins manage returns" ON public.return_requests;
DROP POLICY IF EXISTS "admins can view returns" ON public.return_requests;

CREATE POLICY "admins can view returns"
  ON public.return_requests
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.return_requests FROM authenticated;
GRANT SELECT ON public.return_requests TO authenticated;

-- Uma cobrança confirmadamente devolvida nunca abre um segundo processo. A
-- inclusão de `refunded` no índice também fecha a corrida entre a confirmação
-- administrativa e uma nova tentativa de INSERT.
DROP INDEX IF EXISTS public.return_requests_um_aberto_por_pedido;
CREATE UNIQUE INDEX return_requests_um_aberto_por_pedido
  ON public.return_requests (order_id, order_type)
  WHERE status IN ('requested', 'under_review', 'approved', 'refunded');

-- ----------------------------------------------------------------------------
-- O comprador abre um pedido somente para uma compra paga da própria conta.
-- `_metadata` aceita apenas o rótulo do produto, que é informação de exibição;
-- valor e origem são sempre reconstruídos a partir da compra encontrada.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_return_request(
  _order_type text,
  _order_id uuid,
  _reason text,
  _description text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_order_type text := btrim(COALESCE(_order_type, ''));
  v_reason text := btrim(COALESCE(_reason, ''));
  v_description text := NULLIF(btrim(COALESCE(_description, '')), '');
  v_input_metadata jsonb := COALESCE(_metadata, '{}'::jsonb);
  v_product_label text;
  v_order_amount numeric;
  v_is_test boolean := false;
  v_source_found boolean := false;
  v_request_id uuid;
  v_safe_metadata jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autenticação necessária.';
  END IF;

  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Perfil autenticado não encontrado.';
  END IF;

  IF _order_id IS NULL OR v_order_type NOT IN (
    'store_order',
    'partner_product_order',
    'transaction',
    'subscription_invoice'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Origem da compra inválida.';
  END IF;

  IF char_length(v_reason) > 80 OR v_reason NOT IN (
    'nao_recebi',
    'diferente',
    'defeito',
    'nao_usei',
    'cobranca',
    'outro'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Motivo de estorno inválido.';
  END IF;

  IF char_length(COALESCE(v_description, '')) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A descrição pode ter no máximo 1000 caracteres.';
  END IF;

  IF v_reason IN ('diferente', 'defeito', 'cobranca', 'outro')
     AND char_length(COALESCE(v_description, '')) < 10 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Descreva o ocorrido em pelo menos 10 caracteres.';
  END IF;

  IF jsonb_typeof(v_input_metadata) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Metadata inválida.';
  END IF;

  IF octet_length(v_input_metadata::text) > 4096 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Metadata excede o limite permitido.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_object_keys(v_input_metadata) AS supplied(supplied_key)
     WHERE supplied_key <> 'produto'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Metadata contém campos não permitidos.';
  END IF;

  IF v_input_metadata ? 'produto'
     AND jsonb_typeof(v_input_metadata -> 'produto') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nome do produto inválido.';
  END IF;

  v_product_label := NULLIF(btrim(v_input_metadata ->> 'produto'), '');
  IF char_length(COALESCE(v_product_label, '')) > 300 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nome do produto excede o limite permitido.';
  END IF;

  -- O lock fecha a janela entre validar o pagamento e o trigger bloquear o
  -- release_status da mesma compra.
  IF v_order_type = 'store_order' THEN
    SELECT source_order.total_amount, source_order.is_test
      INTO v_order_amount, v_is_test
      FROM public.store_orders AS source_order
      JOIN public.students AS buyer ON buyer.id = source_order.student_id
     WHERE source_order.id = _order_id
       -- `status` também acompanha a logística: estes três estados só vêm
       -- depois de `paid` e continuam representando uma compra paga.
       AND source_order.status IN ('paid', 'preparing', 'shipped', 'delivered')
       AND buyer.profile_id = v_profile_id
     FOR UPDATE OF source_order;
    v_source_found := FOUND;
  ELSIF v_order_type = 'partner_product_order' THEN
    SELECT source_order.gross_amount, source_order.is_test
      INTO v_order_amount, v_is_test
      FROM public.partner_product_orders AS source_order
      JOIN public.students AS buyer ON buyer.id = source_order.student_id
     WHERE source_order.id = _order_id
       AND source_order.status = 'paid'
       AND buyer.profile_id = v_profile_id
     FOR UPDATE OF source_order;
    v_source_found := FOUND;
  ELSIF v_order_type = 'transaction' THEN
    SELECT source_order.gross_amount, source_order.is_test
      INTO v_order_amount, v_is_test
      FROM public.transactions AS source_order
      JOIN public.students AS buyer ON buyer.id = source_order.student_id
     WHERE source_order.id = _order_id
       AND source_order.status = 'paid'
       AND buyer.profile_id = v_profile_id
       -- Pedidos da loja têm uma transaction-espelho financeira. O estorno
       -- pertence ao store_order canônico; aceitar os dois abriria dois
       -- processos para a mesma cobrança.
       AND NULLIF(btrim(source_order.metadata ->> 'store_order_id'), '') IS NULL
       AND COALESCE(source_order.purchase_type, '') <> 'store_order'
     FOR UPDATE OF source_order;
    v_source_found := FOUND;
  ELSE
    SELECT source_order.amount, source_order.is_test
      INTO v_order_amount, v_is_test
      FROM public.subscription_invoices AS source_order
     WHERE source_order.id = _order_id
       AND source_order.status = 'paid'
       AND source_order.user_id = v_user_id
     FOR UPDATE OF source_order;
    v_source_found := FOUND;
  END IF;

  IF NOT v_source_found OR v_order_amount IS NULL OR v_order_amount <= 0 THEN
    -- Uma mensagem única não confirma se um UUID alheio existe.
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Compra paga desta conta não encontrada.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.return_requests AS previous_request
     WHERE previous_request.order_type = v_order_type
       AND previous_request.order_id = _order_id
       AND previous_request.status = 'refunded'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Esta compra já possui estorno confirmado.';
  END IF;

  v_safe_metadata := jsonb_build_object(
    'valor_da_compra', v_order_amount,
    'origem', v_order_type,
    'is_test', COALESCE(v_is_test, false)
  );
  IF v_product_label IS NOT NULL THEN
    v_safe_metadata := v_safe_metadata || jsonb_build_object('produto', v_product_label);
  END IF;

  INSERT INTO public.return_requests (
    order_id,
    order_type,
    requested_by,
    reason,
    description,
    status,
    blocks_settlement,
    metadata
  )
  VALUES (
    _order_id,
    v_order_type,
    v_profile_id,
    v_reason,
    v_description,
    'requested',
    true,
    v_safe_metadata
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END
$function$;

-- ----------------------------------------------------------------------------
-- O solicitante pode desistir apenas enquanto não houve decisão. O UPDATE
-- altera somente as duas colunas necessárias; campos administrativos não são
-- recebidos pela função.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_return_request(_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $function$
DECLARE
  v_profile_id uuid;
  v_cancelled_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autenticação necessária.';
  END IF;

  v_profile_id := public.current_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Perfil autenticado não encontrado.';
  END IF;

  UPDATE public.return_requests
     SET status = 'cancelled',
         blocks_settlement = false
   WHERE id = _request_id
     AND requested_by = v_profile_id
     AND status IN ('requested', 'under_review')
  RETURNING id INTO v_cancelled_id;

  IF v_cancelled_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pedido de estorno não encontrado ou já decidido.';
  END IF;

  RETURN v_cancelled_id;
END
$function$;

-- ----------------------------------------------------------------------------
-- A administração decide com uma máquina de estados pequena:
-- requested -> under_review | approved | rejected
-- under_review -> approved | rejected
-- approved -> refunded
-- Estados finais não reabrem por esta RPC.
-- `refunded` registra a confirmação de um estorno já executado fora desta
-- função; ela não chama gateway nem movimenta ledger.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decide_return_request(
  _request_id uuid,
  _new_status text,
  _refund_amount numeric DEFAULT NULL,
  _admin_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $function$
DECLARE
  v_admin_profile_id uuid;
  v_request public.return_requests%ROWTYPE;
  v_new_status text := btrim(COALESCE(_new_status, ''));
  v_notes text := NULLIF(btrim(COALESCE(_admin_notes, '')), '');
  v_effective_notes text;
  v_input_refund numeric := CASE
    WHEN _refund_amount IS NULL THEN NULL
    ELSE round(_refund_amount, 2)
  END;
  v_effective_refund numeric;
  v_order_amount numeric;
  v_source_found boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Acesso restrito à administração.';
  END IF;

  v_admin_profile_id := public.current_profile_id();
  IF v_admin_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Perfil administrativo não encontrado.';
  END IF;

  IF _request_id IS NULL OR v_new_status NOT IN (
    'under_review', 'approved', 'rejected', 'refunded'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Decisão de estorno inválida.';
  END IF;

  IF char_length(COALESCE(v_notes, '')) > 3000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A resposta pode ter no máximo 3000 caracteres.';
  END IF;

  SELECT request_row.*
    INTO v_request
    FROM public.return_requests AS request_row
   WHERE request_row.id = _request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pedido de estorno não encontrado.';
  END IF;

  IF NOT (
    (v_request.status = 'requested' AND v_new_status IN ('under_review', 'approved', 'rejected'))
    OR (v_request.status = 'under_review' AND v_new_status IN ('approved', 'rejected'))
    OR (v_request.status = 'approved' AND v_new_status = 'refunded')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Transição de estorno não permitida.';
  END IF;

  IF v_request.order_type = 'store_order' THEN
    SELECT source_order.total_amount
      INTO v_order_amount
      FROM public.store_orders AS source_order
     WHERE source_order.id = v_request.order_id;
    v_source_found := FOUND;
  ELSIF v_request.order_type = 'partner_product_order' THEN
    SELECT source_order.gross_amount
      INTO v_order_amount
      FROM public.partner_product_orders AS source_order
     WHERE source_order.id = v_request.order_id;
    v_source_found := FOUND;
  ELSIF v_request.order_type = 'transaction' THEN
    SELECT source_order.gross_amount
      INTO v_order_amount
      FROM public.transactions AS source_order
     WHERE source_order.id = v_request.order_id;
    v_source_found := FOUND;
  ELSIF v_request.order_type = 'subscription_invoice' THEN
    SELECT source_order.amount
      INTO v_order_amount
      FROM public.subscription_invoices AS source_order
     WHERE source_order.id = v_request.order_id;
    v_source_found := FOUND;
  END IF;

  IF NOT v_source_found OR v_order_amount IS NULL OR v_order_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Compra vinculada ao pedido não encontrada.';
  END IF;

  IF v_input_refund IS NOT NULL
     AND (v_input_refund <= 0 OR v_input_refund > v_order_amount) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valor de estorno inválido para esta compra.';
  END IF;

  v_effective_refund := COALESCE(v_input_refund, v_request.refund_amount);
  IF v_new_status IN ('approved', 'refunded')
     AND (
       v_effective_refund IS NULL
       OR v_effective_refund <= 0
       OR v_effective_refund > v_order_amount
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Informe um valor de estorno válido antes de aprovar.';
  END IF;

  v_effective_notes := COALESCE(v_notes, v_request.admin_notes);
  IF v_new_status = 'rejected' AND v_effective_notes IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Explique ao aluno o motivo da recusa.';
  END IF;
  IF v_new_status = 'refunded' AND v_notes IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Registre a confirmação do estorno já executado.';
  END IF;

  UPDATE public.return_requests
     SET status = v_new_status::public.return_request_status,
         refund_amount = CASE
           WHEN v_new_status = 'rejected' THEN NULL
           ELSE v_effective_refund
         END,
         admin_notes = v_effective_notes,
         resolved_at = CASE
           WHEN v_new_status = 'under_review' THEN NULL
           ELSE now()
         END,
         resolved_by = CASE
           WHEN v_new_status = 'under_review' THEN NULL
           ELSE v_admin_profile_id
         END,
         blocks_settlement = v_new_status IN ('under_review', 'approved')
   WHERE id = v_request.id;

  RETURN v_request.id;
END
$function$;

REVOKE ALL ON FUNCTION public.create_return_request(text, uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_return_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_decide_return_request(uuid, text, numeric, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_return_request(text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_return_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_return_request(uuid, text, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.create_return_request(text, uuid, text, text, jsonb) IS
  'Abre estorno apenas para compra paga pertencente ao usuário autenticado; valor e origem são derivados no servidor.';
COMMENT ON FUNCTION public.cancel_return_request(uuid) IS
  'Cancela somente pedido próprio em requested/under_review, sem aceitar alterações administrativas.';
COMMENT ON FUNCTION public.admin_decide_return_request(uuid, text, numeric, text) IS
  'Aplica transições administrativas; refunded apenas confirma estorno externo já executado e exige nova nota.';
