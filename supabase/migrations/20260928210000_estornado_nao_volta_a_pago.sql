-- Venda estornada não volta a ser paga, venha de onde vier.
--
-- A devolução ao cliente é feita por fora (Pix, maquininha), então no Mercado
-- Pago o pagamento continua "approved" para sempre. Quatro caminhos pegavam
-- esse pagamento e reaplicavam a aprovação: webhook reenviado, consulta de
-- status, a varredura automática (que refaz todo aprovado dos últimos 7 dias
-- cujo pedido não está pago) e o botão "Reprocessar agora" do painel. E
-- `process_partner_product_order_paid` / `mark_store_order_paid_and_process`
-- marcam o pedido como pago sem olhar se ele foi estornado — as comissões que o
-- estorno cancelou voltariam.
--
-- Em 28/09/2026 o painel listava os 6 ingressos da Rave estornados como
-- "aprovados sem processamento". Nenhum voltou porque todos já tinham mais de 7
-- dias quando foram estornados, e ninguém clicou no botão.
--
-- A aplicação já recusa (applyApproval e o alerta). Isto é a última linha: nem
-- SQL direto, nem o reprocessamento manual tiram um pedido de `refunded`.
-- Em transação, `chargeback` é igualmente final.
CREATE OR REPLACE FUNCTION public.estornado_nao_volta_a_pago()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF OLD.status::text IN ('refunded', 'chargeback')
     AND NEW.status::text IS DISTINCT FROM OLD.status::text THEN
    RAISE EXCEPTION 'Venda estornada não volta a "%" (%: %)', NEW.status, TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'check_violation',
            HINT = 'O Mercado Pago continua marcando o pagamento como aprovado porque a devolução foi feita por fora. Não reprocesse.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_estornado_nao_volta_a_pago ON public.partner_product_orders;
CREATE TRIGGER trg_estornado_nao_volta_a_pago
  BEFORE UPDATE OF status ON public.partner_product_orders
  FOR EACH ROW EXECUTE FUNCTION public.estornado_nao_volta_a_pago();

DROP TRIGGER IF EXISTS trg_estornado_nao_volta_a_pago ON public.store_orders;
CREATE TRIGGER trg_estornado_nao_volta_a_pago
  BEFORE UPDATE OF status ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.estornado_nao_volta_a_pago();

DROP TRIGGER IF EXISTS trg_estornado_nao_volta_a_pago ON public.transactions;
CREATE TRIGGER trg_estornado_nao_volta_a_pago
  BEFORE UPDATE OF status ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.estornado_nao_volta_a_pago();
