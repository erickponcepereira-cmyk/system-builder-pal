import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequest } from "@tanstack/react-start/server";
import type { CheckoutSource, PaymentSourceKind } from "./mercadopago-checkout";

type AccessRow = {
  kind: PaymentSourceKind;
  id: string;
  studentId: string | null;
  invoiceUserId: string | null;
  publicPaymentToken: string | null;
  metadata: Record<string, unknown> | null;
  sellingCoachId: string | null;
  professionalCoachId: string | null;
  partnerId: string | null;
};

export type AuthorizedPaymentSource = {
  source: { kind: PaymentSourceKind; id: string };
  publicAccess: boolean;
  userId: string | null;
  canPersistPaymentMethod: boolean;
  payer: { email: string; name?: string } | null;
  publicPaymentToken: string | null;
};

const ACCESS_DENIED = "Você não tem permissão para acessar este pagamento.";
const INVALID_LINK = "Link de pagamento inválido ou indisponível.";

async function loadById(kind: PaymentSourceKind, id: string): Promise<AccessRow | null> {
  if (kind === "store_order") {
    const { data, error } = await supabaseAdmin
      .from("store_orders")
      .select("id,student_id,metadata,public_payment_token")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return {
      kind,
      id: data.id,
      studentId: data.student_id,
      invoiceUserId: null,
      publicPaymentToken: data.public_payment_token,
      metadata: (data.metadata as Record<string, unknown> | null) ?? null,
      sellingCoachId: null,
      professionalCoachId: null,
      partnerId: null,
    };
  }

  if (kind === "partner_product_order") {
    const { data, error } = await supabaseAdmin
      .from("partner_product_orders")
      .select("id,student_id,metadata,public_payment_token,selling_coach_id,professional_coach_id,partner_id")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return {
      kind,
      id: data.id,
      studentId: data.student_id,
      invoiceUserId: null,
      publicPaymentToken: data.public_payment_token,
      metadata: (data.metadata as Record<string, unknown> | null) ?? null,
      sellingCoachId: data.selling_coach_id,
      professionalCoachId: data.professional_coach_id,
      partnerId: data.partner_id,
    };
  }

  if (kind === "subscription_invoice") {
    const { data, error } = await supabaseAdmin
      .from("subscription_invoices")
      .select("id,user_id")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return {
      kind,
      id: data.id,
      studentId: null,
      invoiceUserId: data.user_id,
      publicPaymentToken: null,
      metadata: null,
      sellingCoachId: null,
      professionalCoachId: null,
      partnerId: null,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("id,student_id,metadata")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    kind,
    id: data.id,
    studentId: data.student_id,
    invoiceUserId: null,
    publicPaymentToken: null,
    metadata: (data.metadata as Record<string, unknown> | null) ?? null,
    sellingCoachId: null,
    professionalCoachId: null,
    partnerId: null,
  };
}

async function loadByPublicToken(
  kind: "store_order" | "partner_product_order",
  publicPaymentToken: string,
): Promise<AccessRow | null> {
  if (kind === "store_order") {
    const { data, error } = await supabaseAdmin
      .from("store_orders")
      .select("id,student_id,metadata,public_payment_token")
      .eq("public_payment_token", publicPaymentToken)
      .maybeSingle();
    if (error || !data) return null;
    return {
      kind,
      id: data.id,
      studentId: data.student_id,
      invoiceUserId: null,
      publicPaymentToken: data.public_payment_token,
      metadata: (data.metadata as Record<string, unknown> | null) ?? null,
      sellingCoachId: null,
      professionalCoachId: null,
      partnerId: null,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("partner_product_orders")
    .select("id,student_id,metadata,public_payment_token,selling_coach_id,professional_coach_id,partner_id")
    .eq("public_payment_token", publicPaymentToken)
    .maybeSingle();
  if (error || !data) return null;
  return {
    kind,
    id: data.id,
    studentId: data.student_id,
    invoiceUserId: null,
    publicPaymentToken: data.public_payment_token,
    metadata: (data.metadata as Record<string, unknown> | null) ?? null,
    sellingCoachId: data.selling_coach_id,
    professionalCoachId: data.professional_coach_id,
    partnerId: data.partner_id,
  };
}

async function requestUserId(): Promise<string | null> {
  try {
    const authorization = getRequest()?.headers?.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return null;
    const token = authorization.slice("Bearer ".length).trim();
    if (!token) return null;
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

async function sourcePayer(row: AccessRow): Promise<{ email: string; name?: string }> {
  if (row.studentId) {
    const { data } = await supabaseAdmin
      .from("students")
      .select("profiles!students_profile_id_fkey(name,email)")
      .eq("id", row.studentId)
      .maybeSingle();
    const profile = (data as { profiles?: { name?: string | null; email?: string | null } | null } | null)?.profiles;
    const email = String(profile?.email || "").trim().toLowerCase();
    if (!email) throw new Error("O comprador deste pedido não possui um e-mail válido.");
    return { email, name: profile?.name?.trim() || undefined };
  }

  if (row.invoiceUserId) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("name,email")
      .eq("user_id", row.invoiceUserId)
      .maybeSingle();
    const email = String(data?.email || "").trim().toLowerCase();
    if (!email) throw new Error("O titular desta fatura não possui um e-mail válido.");
    return { email, name: data?.name?.trim() || undefined };
  }

  throw new Error("Não foi possível identificar o comprador deste pagamento.");
}

async function authenticatedAccess(row: AccessRow, userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) throw new Error(ACCESS_DENIED);
  if (profile.role === "admin") return { allowed: true, ownsBuyer: row.invoiceUserId === userId };

  if (row.invoiceUserId) {
    return { allowed: row.invoiceUserId === userId, ownsBuyer: row.invoiceUserId === userId };
  }

  if (!row.studentId) return { allowed: false, ownsBuyer: false };

  const { data: student } = await supabaseAdmin
    .from("students")
    .select("coach_id,professional_coach_id,partner_id,profiles!students_profile_id_fkey(user_id)")
    .eq("id", row.studentId)
    .maybeSingle();
  if (!student) return { allowed: false, ownsBuyer: false };

  const buyerUserId = (student as { profiles?: { user_id?: string | null } | null }).profiles?.user_id || null;
  if (buyerUserId === userId) return { allowed: true, ownsBuyer: true };

  const [{ data: coach }, { data: partner }] = await Promise.all([
    supabaseAdmin.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle(),
    supabaseAdmin.from("partners").select("id").eq("profile_id", profile.id).maybeSingle(),
  ]);
  const coachId = coach?.id || null;
  const partnerId = partner?.id || null;
  const createdByCoachId = typeof row.metadata?.created_by_coach_id === "string"
    ? row.metadata.created_by_coach_id
    : null;

  const coachAllowed = Boolean(
    coachId &&
      (student.coach_id === coachId ||
        student.professional_coach_id === coachId ||
        row.sellingCoachId === coachId ||
        row.professionalCoachId === coachId ||
        createdByCoachId === coachId),
  );
  const partnerAllowed = Boolean(partnerId && (student.partner_id === partnerId || row.partnerId === partnerId));
  return { allowed: coachAllowed || partnerAllowed, ownsBuyer: false };
}

export async function authorizePaymentSource(
  source: CheckoutSource,
  options: { requirePayer?: boolean } = {},
): Promise<AuthorizedPaymentSource> {
  const isPublic = "publicPaymentToken" in source;
  const row = isPublic
    ? await loadByPublicToken(source.kind, source.publicPaymentToken)
    : await loadById(source.kind, source.id);

  if (!row) throw new Error(isPublic ? INVALID_LINK : ACCESS_DENIED);

  let userId: string | null = null;
  let canPersistPaymentMethod = false;
  if (!isPublic) {
    userId = await requestUserId();
    if (!userId) throw new Error("Faça login novamente para continuar o pagamento.");
    const permission = await authenticatedAccess(row, userId);
    if (!permission.allowed) throw new Error(ACCESS_DENIED);
    canPersistPaymentMethod = permission.ownsBuyer;
  }

  return {
    source: { kind: row.kind, id: row.id },
    publicAccess: isPublic,
    userId,
    canPersistPaymentMethod,
    payer: options.requirePayer ? await sourcePayer(row) : null,
    publicPaymentToken: row.publicPaymentToken,
  };
}

export async function assertPaymentBelongsToSource(
  paymentRowId: string,
  source: { kind: PaymentSourceKind; id: string },
) {
  const { data } = await supabaseAdmin
    .from("mercadopago_payments")
    .select("id")
    .eq("id", paymentRowId)
    .eq("source_kind", source.kind)
    .eq("source_id", source.id)
    .maybeSingle();
  if (!data) throw new Error(ACCESS_DENIED);
}
