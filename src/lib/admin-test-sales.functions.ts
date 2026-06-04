import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type SaleKind = "store" | "digital" | "challenge" | "professional" | "partner";
type SimulateInput = {
  kind: SaleKind;
  buyerStudentId: string;
  productId: string;
  sellerCoachId?: string | null;
  referrerStudentId?: string | null;
  paymentMethod?: "pix" | "credit_card" | "debit_card";
};

type Option = { id: string; label: string; detail?: string | null; kind?: SaleKind; price?: number };

export type SimulatedSaleRow = {
  id: string;
  orderNumber: string;
  kind: string;
  status: string;
  amount: number;
  createdAt: string;
  buyerName: string | null;
  productName: string | null;
  payUrl: string;
  flow: Array<{ label: string; amount: number; status?: string | null; recipient?: string | null }>;
};

const TEST_META = { test_simulation: true, source: "admin_test_sale" } as const;

type DeleteInput = { sourceKind: "store_order" | "partner_product_order"; id: string };

async function assertAdmin(userId: string) {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.role !== "admin") throw new Error("Acesso negado");
}

function moneyNumber(value: unknown) {
  return Number(value || 0);
}

function buildOrderMeta(input: SimulateInput, extras: Record<string, unknown> = {}) {
  return {
    ...TEST_META,
    ...extras,
    simulated_at: new Date().toISOString(),
    simulated_sale_kind: input.kind,
    simulated_seller_coach_id: input.sellerCoachId || null,
    simulated_referrer_student_id: input.referrerStudentId || null,
  };
}

async function getProduct(input: SimulateInput) {
  const supabaseAdmin = await getSupabaseAdmin();
  if (input.kind === "digital") {
    const { data, error } = await supabaseAdmin
      .from("digital_products")
      .select("id,title,price,status")
      .eq("id", input.productId)
      .maybeSingle();
    if (error || !data) throw new Error(error?.message || "Curso não encontrado");
    return { id: data.id, title: data.title, price: moneyNumber(data.price), productId: null, digitalProductId: data.id, professionalProductId: null, partnerProductId: null };
  }

  if (input.kind === "professional") {
    const { data, error } = await supabaseAdmin
      .from("professional_products" as never)
      .select("id,name,price,coach_id,coach_commission_percentage,professional_net_amount,coach_commission_amount,network_l1_amount,network_l2_amount,network_l3_amount,status,is_active_by_professional" as never)
      .eq("id" as never, input.productId as never)
      .maybeSingle();
    if (error || !data) throw new Error(error?.message || "Produto profissional não encontrado");
    const row = data as any;
    return { ...row, id: row.id, title: row.name, price: moneyNumber(row.price), productId: null, digitalProductId: null, professionalProductId: row.id, partnerProductId: null };
  }

  if (input.kind === "partner") {
    const { data, error } = await supabaseAdmin
      .from("partner_products" as never)
      .select("id,name,price,partner_id,coach_commission_percentage,partner_net_amount,coach_commission_amount,network_l1_amount,network_l2_amount,network_l3_amount,status,is_active_by_partner" as never)
      .eq("id" as never, input.productId as never)
      .maybeSingle();
    if (error || !data) throw new Error(error?.message || "Produto de parceiro não encontrado");
    const row = data as any;
    return { ...row, id: row.id, title: row.name, price: moneyNumber(row.price), productId: null, digitalProductId: null, professionalProductId: null, partnerProductId: row.id };
  }

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id,name,price,status,is_active,kind")
    .eq("id", input.productId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "Produto não encontrado");
  return { id: data.id, title: data.name, price: moneyNumber(data.price), productId: data.id, digitalProductId: null, professionalProductId: null, partnerProductId: null };
}

async function getCoachUplines(coachId: string | null | undefined) {
  const supabaseAdmin = await getSupabaseAdmin();
  let l1: string | null = null;
  let l2: string | null = null;
  let l3: string | null = null;
  if (!coachId) return { l1, l2, l3 };
  const { data: c1 } = await supabaseAdmin.from("coaches").select("upline_coach_id").eq("id", coachId).maybeSingle();
  l1 = (c1 as any)?.upline_coach_id || null;
  if (l1) {
    const { data: c2 } = await supabaseAdmin.from("coaches").select("upline_coach_id").eq("id", l1).maybeSingle();
    l2 = (c2 as any)?.upline_coach_id || null;
  }
  if (l2) {
    const { data: c3 } = await supabaseAdmin.from("coaches").select("upline_coach_id").eq("id", l2).maybeSingle();
    l3 = (c3 as any)?.upline_coach_id || null;
  }
  return { l1, l2, l3 };
}

async function profileIdForCoach(coachId: string | null | undefined) {
  const supabaseAdmin = await getSupabaseAdmin();
  if (!coachId) return null;
  const { data } = await supabaseAdmin.from("coaches").select("profile_id").eq("id", coachId).maybeSingle();
  return (data as any)?.profile_id || null;
}

async function subtractWallet(profileId: string | null, amount: number) {
  const supabaseAdmin = await getSupabaseAdmin();
  if (!profileId || amount <= 0) return;
  const { data } = await supabaseAdmin
    .from("wallets")
    .select("available_balance,total_earned")
    .eq("profile_id", profileId)
    .maybeSingle();
  const row = data as any;
  if (!row) return;
  await supabaseAdmin
    .from("wallets")
    .update({
      available_balance: Math.max(0, moneyNumber(row.available_balance) - amount),
      total_earned: Math.max(0, moneyNumber(row.total_earned) - amount),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("profile_id", profileId);
}

async function subtractAdminWallet(amount: number) {
  const supabaseAdmin = await getSupabaseAdmin();
  if (amount <= 0) return;
  const { data } = await supabaseAdmin
    .from("admin_system_wallet")
    .select("available_balance,total_earned")
    .eq("id", true)
    .maybeSingle();
  const row = data as any;
  await supabaseAdmin
    .from("admin_system_wallet")
    .update({
      available_balance: Math.max(0, moneyNumber(row?.available_balance) - amount),
      total_earned: Math.max(0, moneyNumber(row?.total_earned) - amount),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", true);
}

async function profileIdForPartner(partnerId: string | null | undefined) {
  const supabaseAdmin = await getSupabaseAdmin();
  if (!partnerId) return null;
  const { data } = await supabaseAdmin.from("partners" as never).select("profile_id" as never).eq("id" as never, partnerId as never).maybeSingle();
  return (data as any)?.profile_id || null;
}

async function deleteSimulation(data: DeleteInput) {
  const supabaseAdmin = await getSupabaseAdmin();
  if (data.sourceKind === "partner_product_order") {
    const { data: order } = await supabaseAdmin
      .from("partner_product_orders" as never)
      .select("metadata,system_fee,coach_net_amount,partner_net_amount,network_l1_amount,network_l2_amount,network_l3_amount,selling_coach_id,upline_l1_coach_id,upline_l2_coach_id,upline_l3_coach_id,professional_coach_id,partner_id" as never)
      .eq("id" as never, data.id as never)
      .maybeSingle();
    const row = order as any;
    if (!row?.metadata?.test_simulation) throw new Error("Este pedido não é uma simulação");
    await subtractAdminWallet(moneyNumber(row.system_fee));
    await subtractWallet(await profileIdForCoach(row.selling_coach_id), moneyNumber(row.coach_net_amount));
    await subtractWallet(await profileIdForCoach(row.upline_l1_coach_id), moneyNumber(row.network_l1_amount));
    await subtractWallet(await profileIdForCoach(row.upline_l2_coach_id), moneyNumber(row.network_l2_amount));
    await subtractWallet(await profileIdForCoach(row.upline_l3_coach_id), moneyNumber(row.network_l3_amount));
    await subtractWallet(await profileIdForCoach(row.professional_coach_id), moneyNumber(row.partner_net_amount));
    await subtractWallet(await profileIdForPartner(row.partner_id), moneyNumber(row.partner_net_amount));
    await supabaseAdmin.from("partner_product_orders" as never).delete().eq("id" as never, data.id as never);
    return { ok: true };
  }

  const { data: order } = await supabaseAdmin.from("store_orders").select("metadata").eq("id", data.id).maybeSingle();
  if (!(order as any)?.metadata?.test_simulation) throw new Error("Este pedido não é uma simulação");
  const { data: txs } = await supabaseAdmin.from("transactions").select("id").filter("metadata->>store_order_id", "eq", data.id);
  const txIds = ((txs as any[]) || []).map((t) => t.id);
  if (txIds.length) {
    await supabaseAdmin.from("commissions").delete().in("transaction_id", txIds);
    await supabaseAdmin.from("transactions").delete().in("id", txIds);
  }
  await supabaseAdmin.from("store_order_items").delete().eq("order_id", data.id);
  await supabaseAdmin.from("store_orders").delete().eq("id", data.id);
  return { ok: true };
}

async function createStoreSimulation(input: SimulateInput) {
  const supabaseAdmin = await getSupabaseAdmin();
  const product = await getProduct(input);
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id,coach_id")
    .eq("id", input.buyerStudentId)
    .maybeSingle();
  if (!student) throw new Error("Aluno comprador não encontrado");

  const sellingCoachId = input.sellerCoachId || (student as any).coach_id || null;
  const metadata = buildOrderMeta(input, {
    created_by_coach_id: sellingCoachId,
    source: "admin_test_sale",
  });

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("store_orders")
    .insert({
      student_id: input.buyerStudentId,
      status: "pending",
      payment_method: input.paymentMethod || "pix",
      subtotal: product.price,
      payment_fee: 0,
      tax_amount: 0,
      total_amount: product.price,
      notes: "Venda simulada pelo admin, sem checkout.",
      metadata,
      referrer_student_id: input.referrerStudentId || null,
    } as never)
    .select("id,order_number,total_amount")
    .single();
  if (orderErr || !order) throw new Error(orderErr?.message || "Falha ao criar pedido de teste");

  const productKind = input.kind === "digital" ? "digital" : input.kind === "challenge" ? "challenge" : "item";
  const { error: itemErr } = await supabaseAdmin.from("store_order_items").insert({
    order_id: (order as any).id,
    product_kind: productKind,
    product_id: product.productId,
    digital_product_id: product.digitalProductId,
    title: product.title,
    quantity: 1,
    unit_price: product.price,
    total_price: product.price,
    metadata: { test_simulation: true },
  } as never);
  if (itemErr) throw new Error(itemErr.message);

  const txPurchaseType = input.kind === "digital" ? "digital" : input.kind === "challenge" ? "challenge" : "store_order";
  const fallbackProductId = product.productId || (await getFallbackProductId());
  const { data: tx, error: txErr } = await supabaseAdmin
    .from("transactions")
    .insert({
      student_id: input.buyerStudentId,
      product_id: fallbackProductId,
      digital_product_id: product.digitalProductId,
      gross_amount: product.price,
      payment_fee: 0,
      tax_amount: 0,
      net_amount: product.price,
      payment_method: input.paymentMethod || "pix",
      installments: 1,
      status: "pending",
      purchase_type: txPurchaseType,
      metadata: { ...metadata, store_order_id: (order as any).id },
      referrer_student_id: input.referrerStudentId || null,
    } as never)
    .select("id")
    .single();
  if (txErr || !tx) throw new Error(txErr?.message || "Falha ao criar transação de teste");

  const { applyApproval } = await import("@/lib/mercadopago-impl.server");
  await applyApproval("store_order", (order as any).id);
  return { sourceKind: "store_order", sourceId: (order as any).id, orderNumber: (order as any).order_number };
}

async function getFallbackProductId() {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("products")
    .select("id")
    .not("price", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.id) throw new Error("Cadastre ao menos um produto base antes de simular curso digital.");
  return data.id as string;
}

async function createPartnerSimulation(input: SimulateInput) {
  const supabaseAdmin = await getSupabaseAdmin();
  const product = await getProduct(input);
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id,coach_id")
    .eq("id", input.buyerStudentId)
    .maybeSingle();
  if (!student) throw new Error("Aluno comprador não encontrado");

  const sellingCoachId = input.sellerCoachId || (student as any).coach_id || null;
  const { l1, l2, l3 } = await getCoachUplines(sellingCoachId);
  const gross = product.price;
  const paymentMethod = input.paymentMethod === "credit_card" || input.paymentMethod === "debit_card" ? "card" : "pix";
  const feePct = paymentMethod === "pix" ? 0.99 : 4.98;
  const paymentFee = Math.round((gross * feePct / 100) * 100) / 100;
  const tax = Math.round((gross * 0.06) * 100) / 100;
  const systemFee = 20;
  const coachPct = moneyNumber(product.coach_commission_percentage || 10);
  const coachCommission = moneyNumber(product.coach_commission_amount) || Math.round((gross * coachPct / 100) * 100) / 100;
  const networkL1 = moneyNumber(product.network_l1_amount) || Math.round((gross * 0.03) * 100) / 100;
  const networkL2 = moneyNumber(product.network_l2_amount) || Math.round((gross * 0.02) * 100) / 100;
  const networkL3 = moneyNumber(product.network_l3_amount) || Math.round((gross * 0.01) * 100) / 100;
  const coachNet = Math.max(0, Math.round((coachCommission - networkL1 - networkL2 - networkL3) * 100) / 100);
  const ownerNet = moneyNumber(product.partner_net_amount || product.professional_net_amount) || Math.max(0, Math.round((gross - paymentFee - tax - systemFee - coachCommission) * 100) / 100);

  const { data: order, error } = await supabaseAdmin
    .from("partner_product_orders" as never)
    .insert({
      student_id: input.buyerStudentId,
      professional_product_id: product.professionalProductId,
      professional_coach_id: product.coach_id || null,
      partner_product_id: product.partnerProductId,
      partner_id: product.partner_id || null,
      selling_coach_id: sellingCoachId,
      upline_l1_coach_id: l1,
      upline_l2_coach_id: l2,
      upline_l3_coach_id: l3,
      payment_method: paymentMethod,
      status: "pending",
      gross_amount: gross,
      payment_fee: paymentFee,
      tax_amount: tax,
      system_fee: systemFee,
      coach_commission_pct: coachPct,
      coach_commission_amount: coachCommission,
      network_l1_amount: networkL1,
      network_l2_amount: networkL2,
      network_l3_amount: networkL3,
      coach_net_amount: coachNet,
      partner_net_amount: ownerNet,
      notes: "Venda simulada pelo admin, sem checkout.",
      metadata: buildOrderMeta(input),
    } as never)
    .select("id,order_number")
    .single();
  if (error || !order) throw new Error(error?.message || "Falha ao criar pedido profissional/parceiro");

  const { applyApproval } = await import("@/lib/mercadopago-impl.server");
  await applyApproval("partner_product_order", (order as any).id);
  return { sourceKind: "partner_product_order", sourceId: (order as any).id, orderNumber: (order as any).order_number };
}

async function listFlowForOrder(sourceKind: string, sourceId: string) {
  const supabaseAdmin = await getSupabaseAdmin();
  if (sourceKind === "partner_product_order") {
    const { data: order } = await supabaseAdmin
      .from("partner_product_orders" as never)
      .select("system_fee,coach_net_amount,partner_net_amount,network_l1_amount,network_l2_amount,network_l3_amount,status" as never)
      .eq("id" as never, sourceId as never)
      .maybeSingle();
    const o = (order as any) || {};
    return [
      { label: "Sistema", amount: moneyNumber(o.system_fee), status: o.status },
      { label: "Coach vendedor", amount: moneyNumber(o.coach_net_amount), status: o.status },
      { label: "Rede nível 1", amount: moneyNumber(o.network_l1_amount), status: o.status },
      { label: "Rede nível 2", amount: moneyNumber(o.network_l2_amount), status: o.status },
      { label: "Rede nível 3", amount: moneyNumber(o.network_l3_amount), status: o.status },
      { label: "Profissional/parceiro", amount: moneyNumber(o.partner_net_amount), status: o.status },
    ].filter((item) => item.amount > 0);
  }

  const { data: txs } = await supabaseAdmin
    .from("transactions")
    .select("id")
    .filter("metadata->>store_order_id", "eq", sourceId);
  const txIds = ((txs as any[]) || []).map((tx) => tx.id);
  if (!txIds.length) return [];
  const { data: comms } = await supabaseAdmin
    .from("commissions")
    .select("amount,status,slot_label,level,profiles:beneficiary_profile_id(name,email)")
    .in("transaction_id", txIds);
  return ((comms as any[]) || []).map((c) => ({
    label: c.slot_label || (c.level > 0 ? `Rede nível ${c.level}` : "Comissão"),
    amount: moneyNumber(c.amount),
    status: c.status,
    recipient: c.profiles?.name || c.profiles?.email || null,
  }));
}

export const getAdminTestSalesData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    await assertAdmin(context.userId);
    const [students, coaches, products, digitals, professionals, partnerProducts] = await Promise.all([
      supabaseAdmin.from("students").select("id,profiles:profile_id(name,email)").order("created_at", { ascending: false }).limit(300),
      supabaseAdmin.from("coaches").select("id,referral_code,profiles:profile_id(name,email)").order("created_at", { ascending: false }).limit(300),
      supabaseAdmin.from("products").select("id,name,price,kind,type,product_type,status,is_active,has_challenge_access").eq("status", "active").order("sort_order", { ascending: true }).limit(300),
      supabaseAdmin.from("digital_products").select("id,title,price,status").limit(300),
      supabaseAdmin.from("professional_products" as never).select("id,name,price,status,is_active_by_professional" as never).eq("is_active_by_professional" as never, true as never).limit(300),
      supabaseAdmin.from("partner_products" as never).select("id,name,price,status,is_active_by_partner" as never).eq("is_active_by_partner" as never, true as never).limit(300),
    ]);

    const criticalError = students.error || coaches.error || products.error;
    if (criticalError) throw new Error(`Erro ao carregar opções: ${criticalError.message}`);

    const productOptions: Option[] = [];
    ((products.data as any[]) || [])
      .filter((p) => p.is_active !== false)
      .forEach((p) => {
        const detail = p.product_type || p.type || p.kind || "Plano/desafio";
        productOptions.push({ id: p.id, label: p.name, detail: `Plano/desafio · ${detail}`, kind: "challenge", price: moneyNumber(p.price) });
        if (p.kind) productOptions.push({ id: p.id, label: p.name, detail: `Coach → aluno / loja · ${p.kind}`, kind: "store", price: moneyNumber(p.price) });
        if (p.kind === "digital") productOptions.push({ id: p.id, label: p.name, detail: "Curso digital · produtos", kind: "digital", price: moneyNumber(p.price) });
      });
    ((digitals.data as any[]) || [])
      .filter((p) => !p.status || p.status === "active" || p.status === "approved")
      .forEach((p) => productOptions.push({ id: p.id, label: p.title, detail: "Curso digital", kind: "digital", price: moneyNumber(p.price) }));
    ((professionals.data as any[]) || [])
      .forEach((p) => productOptions.push({ id: p.id, label: p.name, detail: `Profissional · ${p.status || "ativo"}`, kind: "professional", price: moneyNumber(p.price) }));
    ((partnerProducts.data as any[]) || [])
      .forEach((p) => productOptions.push({ id: p.id, label: p.name, detail: `Parceiro · ${p.status || "ativo"}`, kind: "partner", price: moneyNumber(p.price) }));

    return {
      students: ((students.data as any[]) || []).map((s) => ({ id: s.id, label: s.profiles?.name || "Aluno", detail: s.profiles?.email || null })),
      coaches: ((coaches.data as any[]) || []).map((c) => ({ id: c.id, label: c.profiles?.name || "Coach", detail: c.profiles?.email || c.referral_code || null })),
      products: productOptions.sort((a, b) => a.label.localeCompare(b.label)),
    };
  });

export const simulateAdminTestSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as SimulateInput)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (!data.buyerStudentId || !data.productId || !data.kind) throw new Error("Preencha aluno, produto e tipo de venda");
    if (data.kind === "professional" || data.kind === "partner") return createPartnerSimulation(data);
    return createStoreSimulation(data);
  });

export const listAdminTestSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SimulatedSaleRow[]> => {
    const supabaseAdmin = await getSupabaseAdmin();
    await assertAdmin(context.userId);
    const [storeOrders, partnerOrders] = await Promise.all([
      supabaseAdmin
        .from("store_orders")
        .select("id,order_number,status,total_amount,created_at,metadata,students:student_id(profiles:profile_id(name)),store_order_items(title)")
        .contains("metadata", TEST_META as never)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("partner_product_orders" as never)
        .select("id,order_number,status,gross_amount,created_at,metadata,student:students!partner_product_orders_student_id_fkey(profile:profiles!students_profile_id_fkey(name)),professional_product:professional_product_id(name),partner_product:partner_product_id(name)" as never)
        .contains("metadata" as never, TEST_META as never)
        .order("created_at" as never, { ascending: false })
        .limit(100),
    ]);

    const rows: SimulatedSaleRow[] = [];
    for (const o of ((storeOrders.data as any[]) || [])) {
      rows.push({
        id: o.id,
        orderNumber: o.order_number,
        kind: o.metadata?.simulated_sale_kind || "store",
        status: o.status,
        amount: moneyNumber(o.total_amount),
        createdAt: o.created_at,
        buyerName: o.students?.profiles?.name || null,
        productName: (o.store_order_items || []).map((i: any) => i.title).join(", ") || null,
        payUrl: `/pay/${o.order_number}`,
        flow: await listFlowForOrder("store_order", o.id),
      });
    }
    for (const o of ((partnerOrders.data as any[]) || [])) {
      rows.push({
        id: o.id,
        orderNumber: o.order_number,
        kind: o.metadata?.simulated_sale_kind || "professional",
        status: o.status,
        amount: moneyNumber(o.gross_amount),
        createdAt: o.created_at,
        buyerName: o.student?.profile?.name || null,
        productName: o.professional_product?.name || o.partner_product?.name || null,
        payUrl: `/pay/${o.order_number}`,
        flow: await listFlowForOrder("partner_product_order", o.id),
      });
    }
    return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  });

export const deleteAdminTestSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input as DeleteInput)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    return deleteSimulation(data);
  });

export const resetAdminTestSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    await assertAdmin(context.userId);
    const [{ data: storeRows }, { data: partnerRows }] = await Promise.all([
      supabaseAdmin.from("store_orders").select("id").contains("metadata", TEST_META as never),
      supabaseAdmin.from("partner_product_orders" as never).select("id" as never).contains("metadata" as never, TEST_META as never),
    ]);
    const rows: DeleteInput[] = [
      ...(((storeRows as any[]) || []).map((row) => ({ id: row.id, sourceKind: "store_order" as const }))),
      ...(((partnerRows as any[]) || []).map((row) => ({ id: row.id, sourceKind: "partner_product_order" as const }))),
    ];
    for (const row of rows) {
      await deleteSimulation(row);
    }
    return { deleted: rows.length };
  });
