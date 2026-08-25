-- URGENTE — curso não pode distribuir comissão pelo produto errado
-- 25/08/2026. Aplicar ANTES de qualquer venda de curso.
--
-- O QUE ACONTECEU, SEM RODEIO
--
-- Ao fazer `create_store_order` aceitar curso (migration 20260825025415), eu
-- precisei preencher `transactions.product_id`, que é NOT NULL. Para carrinho
-- só de curso não existe produto da tabela `products`, então usei "um produto
-- ativo qualquer" como preenchimento.
--
-- Só que `process_paid_transaction` decide o rateio assim:
--
--     SELECT COUNT(*) FROM public.product_value_slots
--      WHERE product_id = tx.product_id AND is_active = true;
--
-- O campo que eu tratei como preenchimento é o que DECIDE para onde vai o
-- dinheiro. Nos dois caminhos possíveis dá errado:
--
--   • produto de preenchimento COM slots -> o dinheiro do curso é dividido
--     pelas regras de um produto que não tem nada a ver com ele;
--   • produto de preenchimento SEM slots -> `slot_count = 0`, nada é
--     distribuído, e o bloco do "remainder" manda **100% do valor** como
--     comissão pendente para o coach do aluno.
--
-- E `v_card_days := product.card_access_days` daria ao comprador os dias de
-- carteirinha do produto de preenchimento.
--
-- Nenhuma venda real passou por aqui — antes de 25/08 o pedido de curso nem
-- nascia. Mas o caminho está aberto desde então.
--
-- POR QUE A CORREÇÃO É POR DADO, E NÃO POR REMENDO NA FUNÇÃO
--
-- A tentação é enfiar um `RETURN` dentro de `process_paid_transaction`. São
-- 450 linhas, reescritas há poucas horas, e é o coração do financeiro:
-- remendar por texto ali é apostar que um `regexp_replace` acertou o lugar.
-- Se errar, quebra o rateio de TODO mundo, não só o de curso.
--
-- Então a correção não toca na função. Ela cria um produto dedicado, invisível
-- na loja, com o rateio de curso configurado em slots — do jeito que todo o
-- resto do sistema já configura rateio. O motor continua fazendo exatamente o
-- que sempre fez; muda só o produto que ele lê.
--
-- Efeito colateral bom: quando o rateio de curso for desenhado, ele é
-- configurado na tela de slots, sem tocar em código nenhum.

begin;

-- ---------------------------------------------------------------------------
-- 1. O produto que representa "venda de curso"
-- ---------------------------------------------------------------------------
-- `status = 'inactive'` para não aparecer em vitrine nenhuma: a loja lê
-- 'active'. Ele existe só para carregar as regras de rateio.
--
-- `card_access_days = 0` e `points_per_sale = 0` de propósito: sem isso, a
-- compra de curso daria dias de carteirinha e pontos de carreira herdados de
-- um produto alheio.

insert into public.products (name, description, price, type, status, card_access_days, points_per_sale, sort_order)
select 'Venda de curso (rateio)',
       'Produto interno. Não aparece na loja. Existe para carregar as regras de rateio das compras de curso digital.',
       0, 'digital_course', 'inactive', 0, 0, 9999
 where not exists (
   select 1 from public.products where name = 'Venda de curso (rateio)'
 );

-- ---------------------------------------------------------------------------
-- 2. O rateio de partida: tudo para a plataforma
-- ---------------------------------------------------------------------------
-- Curso ainda NÃO TEM rateio de criador implementado. As colunas existem
-- (`coach_created_courses.creator_commission_percentage`, `platform_percentage`,
-- `upline_commission_percentage`) e nenhuma linha de código as lê.
--
-- Enquanto for assim, o dinheiro fica com a plataforma e é repassado à mão. É
-- pendência conhecida, não dinheiro perdido — o contrário do que acontece
-- quando se paga comissão a quem não vendeu, que sai e não volta.
--
-- Para mudar depois: é só editar os slots deste produto na tela de rateio.

insert into public.product_value_slots
  (product_id, slot_order, label, destination, value_type, value_amount, is_active)
select p.id, 1, 'Curso digital — plataforma', 'platform_reserve'::public.value_destination_type,
       'pct_base', 100, true
  from public.products p
 where p.name = 'Venda de curso (rateio)'
   and not exists (
     select 1 from public.product_value_slots s where s.product_id = p.id
   );

-- ---------------------------------------------------------------------------
-- 3. create_store_order aponta para ele, e recusa se ele sumir
-- ---------------------------------------------------------------------------
-- A recusa é deliberada: sem o produto de rateio, a alternativa seria voltar a
-- pegar "um qualquer". Melhor a venda não sair e alguém ser avisado do que
-- sair pagando errado em silêncio.

create or replace function public.create_store_order(
  _items jsonb,
  _payment_method public.payment_method default 'pix'::public.payment_method,
  _shipping jsonb default '{}'::jsonb,
  _notes text default null,
  _referrer_student_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
DECLARE
  current_profile_id uuid;
  current_student_id uuid;
  fallback_product_id uuid;
  new_order_id uuid;
  cart_item jsonb;
  cart_kind text;
  source_id uuid;
  product_title text;
  product_price numeric;
  cart_qty integer;
  item_kind_internal text;
  order_subtotal numeric := 0;
  order_payment_fee numeric := 0;
  order_tax_amount numeric := 0;
  order_total numeric := 0;
  v_ref_student_id uuid := NULL;
  v_referral_product_enabled boolean := false;
  v_is_digital boolean;
  v_digital_id uuid;
  v_qtd_itens int;
  v_qtd_digitais int;
  v_so_digital boolean;
  v_unico_curso uuid;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;
  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE i->>'kind' = 'digital')
    INTO v_qtd_itens, v_qtd_digitais
    FROM jsonb_array_elements(_items) i;
  v_so_digital := (v_qtd_itens = v_qtd_digitais);

  IF v_so_digital THEN
    SELECT (i->>'sourceId')::uuid INTO v_unico_curso
      FROM jsonb_array_elements(_items) i LIMIT 1;

    -- CORREÇÃO: produto DEDICADO, com rateio de curso configurado. Antes aqui
    -- entrava "um produto ativo qualquer", e era ele que decidia o rateio.
    SELECT id INTO fallback_product_id
      FROM public.products
     WHERE name = 'Venda de curso (rateio)'
     LIMIT 1;

    IF fallback_product_id IS NULL THEN
      RAISE EXCEPTION
        'Produto de rateio de curso ausente. Aplique 2026-08-25-curso-nao-paga-comissao-errada.sql antes de vender curso.';
    END IF;
  ELSE
    -- Carrinho misto ou comum: o produto de referência é um item REAL do
    -- carrinho, como sempre foi.
    SELECT (i->>'sourceId')::uuid INTO fallback_product_id
      FROM jsonb_array_elements(_items) i
     WHERE exists (select 1 from public.products p where p.id = (i->>'sourceId')::uuid)
     LIMIT 1;

    IF fallback_product_id IS NULL THEN
      RAISE EXCEPTION 'Item do carrinho sem produto válido';
    END IF;
  END IF;

  SELECT COALESCE(pr.is_referral_product, false)
    INTO v_referral_product_enabled
  FROM public.products p
  LEFT JOIN public.product_referral_rules pr ON pr.product_id = p.id
  WHERE p.id = fallback_product_id;

  IF _referrer_student_id IS NOT NULL
     AND _referrer_student_id <> current_student_id
     AND COALESCE(v_referral_product_enabled, false) = true THEN
    PERFORM 1 FROM public.students WHERE id = _referrer_student_id;
    IF FOUND THEN
      v_ref_student_id := _referrer_student_id;
    END IF;
  END IF;

  INSERT INTO public.store_orders (
    student_id, payment_method, shipping_name, shipping_phone, shipping_zip,
    shipping_address, shipping_city, shipping_state, notes, referrer_student_id
  ) VALUES (
    current_student_id,
    COALESCE(_payment_method, 'pix'),
    NULLIF(_shipping->>'name', ''),
    NULLIF(_shipping->>'phone', ''),
    NULLIF(_shipping->>'zip', ''),
    NULLIF(_shipping->>'address', ''),
    NULLIF(_shipping->>'city', ''),
    NULLIF(_shipping->>'state', ''),
    _notes,
    v_ref_student_id
  )
  RETURNING id INTO new_order_id;

  FOR cart_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    cart_kind := cart_item->>'kind';
    source_id := (cart_item->>'sourceId')::uuid;
    cart_qty  := COALESCE((cart_item->>'quantity')::integer, 1);

    v_is_digital := (cart_kind = 'digital');
    v_digital_id := NULL;

    IF v_is_digital THEN
      SELECT title, price INTO product_title, product_price
        FROM public.digital_products
       WHERE id = source_id AND status = 'active';

      IF product_title IS NULL THEN
        RAISE EXCEPTION 'Curso % não encontrado ou fora da loja', source_id;
      END IF;

      v_digital_id := source_id;
      item_kind_internal := 'digital';
    ELSE
      SELECT name, price INTO product_title, product_price
      FROM public.products WHERE id = source_id;

      IF product_title IS NULL THEN
        RAISE EXCEPTION 'Produto % não encontrado', source_id;
      END IF;

      IF cart_kind = 'plan' THEN
        item_kind_internal := 'plan';
      ELSE
        item_kind_internal := CASE WHEN (SELECT stock FROM public.products WHERE id = source_id) IS NULL
                                   THEN 'digital' ELSE 'physical' END;
      END IF;
    END IF;

    INSERT INTO public.store_order_items (
      order_id, product_id, digital_product_id, title, unit_price, quantity, total_price, product_kind
    ) VALUES (
      new_order_id,
      CASE WHEN v_is_digital THEN NULL ELSE source_id END,
      v_digital_id,
      product_title,
      product_price, cart_qty, product_price * cart_qty,
      item_kind_internal
    );

    order_subtotal := order_subtotal + (product_price * cart_qty);
  END LOOP;

  order_total := order_subtotal;

  UPDATE public.store_orders
  SET subtotal = order_subtotal,
      payment_fee = order_payment_fee,
      tax_amount = order_tax_amount,
      total_amount = order_total
  WHERE id = new_order_id;

  INSERT INTO public.transactions (
    student_id, product_id, digital_product_id, gross_amount, payment_fee, tax_amount, net_amount,
    payment_method, installments, status, purchase_type, metadata, referrer_student_id
  ) VALUES (
    current_student_id,
    fallback_product_id,
    CASE WHEN v_so_digital THEN v_unico_curso ELSE NULL END,
    order_total,
    order_payment_fee,
    order_tax_amount,
    order_total,
    COALESCE(_payment_method, 'pix'),
    1,
    'pending',
    -- Continua 'store_order' mesmo para curso: é o pedido da loja que está
    -- sendo pago, e `liberar_cursos_do_pedido` já cuida do acesso pelos ITENS.
    -- Marcar 'digital' faria o bloco de `digital_purchases` da própria
    -- `process_paid_transaction` inserir também — funcionaria, porque a
    -- inserção é idempotente, mas seriam dois caminhos para o mesmo fato.
    'store_order',
    jsonb_build_object('store_order_id', new_order_id),
    v_ref_student_id
  );

  RETURN new_order_id;
END;
$fn$;

commit;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
-- 1) O produto de rateio existe e está FORA da loja?
--    select id, name, status, card_access_days, points_per_sale
--      from public.products where name = 'Venda de curso (rateio)';
--    -> status tem de ser 'inactive', e os dois zeros zerados.
--
-- 2) Ele tem exatamente um slot, de 100% para a plataforma?
--    select slot_order, label, destination, value_type, value_amount, is_active
--      from public.product_value_slots s
--      join public.products p on p.id = s.product_id
--     where p.name = 'Venda de curso (rateio)';
--
-- 3) O produto NÃO aparece na loja (a vitrine lê status='active'):
--    select count(*) from public.products
--     where name = 'Venda de curso (rateio)' and status = 'active';   -> 0
--
-- 4) Depois de uma compra de curso paga, confira para onde foi:
--    select c.slot_label, c.amount, c.beneficiary_coach_id
--      from public.commissions c
--      join public.transactions t on t.id = c.transaction_id
--     where t.digital_product_id is not null
--     order by c.created_at desc limit 10;
--    -> espera-se plataforma, e NENHUMA linha de 'Comissão do Vendedor'.
