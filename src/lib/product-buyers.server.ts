export type ProductBuyerRow = {
  orderId: string;
  orderNumber: string | null;
  name: string;
  phone: string | null;
  purchasedAt: string | null;
  status: string;
  amount: number;
  coachName: string | null;
};

export type ProductBuyersResult = {
  productName: string;
  stock: number | null;
  remaining: number | null;
  paidCount: number;
  pendingCount: number;
  cancelledCount: number;
  buyers: ProductBuyerRow[];
};

export const CANCELLED_STATUSES = ["cancelled", "refunded", "failed", "rejected"];

type AnyClient = any;

/** Verifica se o usuário é dono do produto ou coprodutor aceito. Lança erro se não for. */
export async function assertProductAccess(
  admin: AnyClient,
  userId: string,
  productType: "partner" | "professional",
  productId: string,
): Promise<{ productName: string; stock: number | null }> {
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const profileId = (profile as { id: string } | null)?.id;
  if (!profileId) throw new Error("Perfil não encontrado.");

  const table = productType === "partner" ? "partner_products" : "professional_products";
  const { data: product } = await admin
    .from(table)
    .select(productType === "partner" ? "id,name,stock,partner_id" : "id,name,stock,coach_id")
    .eq("id", productId)
    .maybeSingle();
  if (!product) throw new Error("Produto não encontrado.");

  // entidades do usuário
  const [{ data: myPartners }, { data: myCoaches }] = await Promise.all([
    admin.from("partners").select("id").eq("profile_id", profileId),
    admin.from("coaches").select("id").eq("profile_id", profileId),
  ]);
  const partnerIds = ((myPartners as Array<{ id: string }>) || []).map((p) => p.id);
  const coachIds = ((myCoaches as Array<{ id: string }>) || []).map((c) => c.id);

  const isOwner =
    productType === "partner"
      ? partnerIds.includes((product as { partner_id: string }).partner_id)
      : coachIds.includes((product as { coach_id: string }).coach_id);

  let allowed = isOwner;

  if (!allowed) {
    const { data: coprods } = await admin
      .from("product_coproductions")
      .select("collaborator_type,collaborator_id,status")
      .eq("product_type", productType)
      .eq("product_id", productId)
      .eq("status", "accepted");
    allowed = ((coprods as Array<{ collaborator_type: string; collaborator_id: string }>) || []).some((c) =>
      c.collaborator_type === "partner" ? partnerIds.includes(c.collaborator_id) : coachIds.includes(c.collaborator_id),
    );
  }

  if (!allowed) throw new Error("Sem permissão para ver os compradores deste produto.");

  const p = product as { name: string; stock: number | null };
  return { productName: p.name, stock: p.stock ?? null };
}

export async function fetchProductBuyers(
  admin: AnyClient,
  productType: "partner" | "professional",
  productId: string,
): Promise<ProductBuyerRow[]> {
  const column = productType === "partner" ? "partner_product_id" : "professional_product_id";
  const { data: ordersData } = await admin
    .from("partner_product_orders")
    .select("id,order_number,status,gross_amount,paid_at,created_at,student_id,selling_coach_id")
    .eq(column, productId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  const orders = ((ordersData as Array<{
    id: string;
    order_number: string | null;
    status: string;
    gross_amount: number | null;
    paid_at: string | null;
    created_at: string | null;
    student_id: string | null;
    selling_coach_id: string | null;
  }>) || []);
  if (orders.length === 0) return [];

  const studentIds = Array.from(new Set(orders.map((o) => o.student_id).filter(Boolean))) as string[];
  const coachIds = Array.from(new Set(orders.map((o) => o.selling_coach_id).filter(Boolean))) as string[];

  const [studentsRes, coachesRes] = await Promise.all([
    studentIds.length
      ? admin.from("students").select("id,profile_id").in("id", studentIds)
      : Promise.resolve({ data: [] }),
    coachIds.length
      ? admin.from("coaches").select("id,profile_id").in("id", coachIds)
      : Promise.resolve({ data: [] }),
  ]);

  const students = ((studentsRes.data as Array<{ id: string; profile_id: string | null }>) || []);
  const coaches = ((coachesRes.data as Array<{ id: string; profile_id: string | null }>) || []);

  const profileIds = Array.from(
    new Set([...students, ...coaches].map((r) => r.profile_id).filter(Boolean)),
  ) as string[];
  const { data: profilesData } = profileIds.length
    ? await admin.from("profiles").select("id,name,phone").in("id", profileIds)
    : { data: [] };
  const profiles = new Map(
    (((profilesData as Array<{ id: string; name: string | null; phone: string | null }>) || [])).map((p) => [p.id, p]),
  );

  const studentProfile = new Map(students.map((s) => [s.id, s.profile_id]));
  const coachProfile = new Map(coaches.map((c) => [c.id, c.profile_id]));

  return orders.map((o) => {
    const sp = o.student_id ? studentProfile.get(o.student_id) : null;
    const buyer = sp ? profiles.get(sp) : null;
    const cp = o.selling_coach_id ? coachProfile.get(o.selling_coach_id) : null;
    const coach = cp ? profiles.get(cp) : null;
    return {
      orderId: o.id,
      orderNumber: o.order_number,
      name: buyer?.name || "Sem nome",
      phone: buyer?.phone || null,
      purchasedAt: o.paid_at || o.created_at,
      status: o.status,
      amount: Number(o.gross_amount) || 0,
      coachName: coach?.name || null,
    };
  });
}
