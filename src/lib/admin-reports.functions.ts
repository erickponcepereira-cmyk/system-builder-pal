/**
 * Admin reports — detailed sales with full slot/commission distribution per transaction.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface SaleCommissionRow {
  beneficiaryName: string | null;
  slotLabel: string | null;
  level: number;
  percentage: number;
  amount: number;
  status: string | null;
  isMasterCoach: boolean;
}

export interface DetailedSale {
  transactionId: string;
  createdAt: string;
  paidAt: string | null;
  status: string;
  paymentMethod: string;
  installments: number;
  grossAmount: number;
  appFee: number;
  paymentFee: number;
  taxAmount: number;
  netAmount: number;
  studentName: string | null;
  studentEmail: string | null;
  productName: string | null;
  sellerCoachName: string | null;
  upline1Name: string | null;
  upline2Name: string | null;
  upline3Name: string | null;
  masterCoachName: string | null;
  pointsGenerated: number;
  commissions: SaleCommissionRow[];
  distributedTotal: number;
  surplusToSeller: number;
  /** Canal: "store" (aluno comprou sozinho na loja) ou "coach" (coach vendeu / outro). */
  saleChannel: "store" | "coach";
  saleChannelLabel: string;
  purchaseType: string | null;
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || (data as any).role !== "admin") throw new Error("Acesso negado");
}

export const listDetailedSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string; limit?: number }) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<DetailedSale[]> => {
    await assertAdmin(context.userId);

    // Fetch transactions
    let q = supabaseAdmin
      .from("transactions" as never)
      .select(
        "id,created_at,paid_at,status,payment_method,installments,gross_amount,app_fee,payment_fee,tax_amount,net_amount,product_id,student_id,purchase_type" as never,
      )
      .order("created_at" as never, { ascending: false })
      .limit(data.limit);
    if (data.from) q = q.gte("created_at" as never, data.from as never);
    if (data.to) q = q.lte("created_at" as never, data.to as never);

    const { data: txRows, error: txErr } = await q;
    if (txErr) throw new Error(txErr.message);

    const txs = (txRows as any[]) || [];
    if (txs.length === 0) return [];

    const txIds = txs.map((t) => t.id);
    const productIds = [...new Set(txs.map((t) => t.product_id).filter(Boolean))];
    const studentIds = [...new Set(txs.map((t) => t.student_id).filter(Boolean))];

    // Bulk fetch
    const [{ data: commissions }, { data: products }, { data: students }, { data: points }] =
      await Promise.all([
        supabaseAdmin
          .from("commissions" as never)
          .select(
            "transaction_id,beneficiary_profile_id,beneficiary_coach_id,level,percentage,amount,status,slot_label,is_master_coach_commission" as never,
          )
          .in("transaction_id" as never, txIds as never),
        productIds.length
          ? supabaseAdmin
              .from("products" as never)
              .select("id,name" as never)
              .in("id" as never, productIds as never)
          : Promise.resolve({ data: [] as any[] }),
        studentIds.length
          ? supabaseAdmin
              .from("students" as never)
              .select("id,profile_id,coach_id" as never)
              .in("id" as never, studentIds as never)
          : Promise.resolve({ data: [] as any[] }),
        supabaseAdmin
          .from("coach_points_log" as never)
          .select("transaction_id,points" as never)
          .in("transaction_id" as never, txIds as never),
      ]);

    // Resolve profile names
    const profileIds = new Set<string>();
    (commissions as any[] | null)?.forEach((c) => c.beneficiary_profile_id && profileIds.add(c.beneficiary_profile_id));
    (students as any[] | null)?.forEach((s) => s.profile_id && profileIds.add(s.profile_id));

    const coachIds = new Set<string>();
    (students as any[] | null)?.forEach((s) => s.coach_id && coachIds.add(s.coach_id));

    const [{ data: profiles }, { data: coaches }] = await Promise.all([
      profileIds.size
        ? supabaseAdmin
            .from("profiles")
            .select("id,name,email")
            .in("id", Array.from(profileIds))
        : Promise.resolve({ data: [] as any[] }),
      coachIds.size
        ? supabaseAdmin
            .from("coaches")
            .select("id,profile_id,upline_coach_id")
            .in("id", Array.from(coachIds))
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // Maps
    const productMap = new Map((products as any[] | null || []).map((p) => [p.id, p.name]));
    const profileMap = new Map((profiles as any[] | null || []).map((p) => [p.id, p]));
    const studentMap = new Map((students as any[] | null || []).map((s) => [s.id, s]));
    const coachMap = new Map((coaches as any[] | null || []).map((c) => [c.id, c]));

    const nameForCoach = (coachId: string | null | undefined): string | null => {
      if (!coachId) return null;
      const coach = coachMap.get(coachId);
      if (!coach) return null;
      const prof = profileMap.get(coach.profile_id);
      return prof?.name || null;
    };

    // Group commissions per transaction
    const commissionsByTx = new Map<string, any[]>();
    (commissions as any[] | null || []).forEach((c) => {
      const arr = commissionsByTx.get(c.transaction_id) || [];
      arr.push(c);
      commissionsByTx.set(c.transaction_id, arr);
    });

    // Sum points per tx
    const pointsByTx = new Map<string, number>();
    (points as any[] | null || []).forEach((p) => {
      pointsByTx.set(p.transaction_id, (pointsByTx.get(p.transaction_id) || 0) + Number(p.points || 0));
    });

    // Need upline names → fetch upline coaches in second pass
    const uplineIds = new Set<string>();
    Array.from(coachMap.values()).forEach((c) => c.upline_coach_id && uplineIds.add(c.upline_coach_id));
    if (uplineIds.size) {
      const { data: uplines } = await supabaseAdmin
        .from("coaches")
        .select("id,profile_id,upline_coach_id")
        .in("id", Array.from(uplineIds));
      (uplines as any[] | null || []).forEach((u) => coachMap.set(u.id, u));
      // and their uplines (level 2)
      const lvl2 = new Set<string>();
      (uplines as any[] | null || []).forEach((u) => u.upline_coach_id && lvl2.add(u.upline_coach_id));
      if (lvl2.size) {
        const { data: ul2 } = await supabaseAdmin
          .from("coaches")
          .select("id,profile_id,upline_coach_id")
          .in("id", Array.from(lvl2));
        (ul2 as any[] | null || []).forEach((u) => coachMap.set(u.id, u));
        const lvl3 = new Set<string>();
        (ul2 as any[] | null || []).forEach((u) => u.upline_coach_id && lvl3.add(u.upline_coach_id));
        if (lvl3.size) {
          const { data: ul3 } = await supabaseAdmin
            .from("coaches")
            .select("id,profile_id,upline_coach_id")
            .in("id", Array.from(lvl3));
          (ul3 as any[] | null || []).forEach((u) => coachMap.set(u.id, u));
        }
      }
      // pull missing profile names
      const missingProfiles = new Set<string>();
      coachMap.forEach((c) => {
        if (c.profile_id && !profileMap.has(c.profile_id)) missingProfiles.add(c.profile_id);
      });
      if (missingProfiles.size) {
        const { data: extra } = await supabaseAdmin
          .from("profiles")
          .select("id,name,email")
          .in("id", Array.from(missingProfiles));
        (extra as any[] | null || []).forEach((p) => profileMap.set(p.id, p));
      }
    }

    return txs.map((t) => {
      const stu = studentMap.get(t.student_id);
      const stuProfile = stu?.profile_id ? profileMap.get(stu.profile_id) : null;
      const sellerCoach = stu?.coach_id ? coachMap.get(stu.coach_id) : null;
      const up1 = sellerCoach?.upline_coach_id ? coachMap.get(sellerCoach.upline_coach_id) : null;
      const up2 = up1?.upline_coach_id ? coachMap.get(up1.upline_coach_id) : null;
      const up3 = up2?.upline_coach_id ? coachMap.get(up2.upline_coach_id) : null;

      const txCommissions = commissionsByTx.get(t.id) || [];
      const distributedTotal = txCommissions.reduce((s, c) => s + Number(c.amount || 0), 0);
      const sellerCommissions = txCommissions.filter(
        (c) => c.beneficiary_coach_id === stu?.coach_id && !c.is_master_coach_commission,
      );
      // surplus = portion in seller's "extra/surplus" slot (slot_label contains "Sobra" or "Vendedor")
      const surplus = sellerCommissions
        .filter((c) => (c.slot_label || "").toLowerCase().includes("sobra") || (c.slot_label || "").toLowerCase().includes("vendedor"))
        .reduce((s, c) => s + Number(c.amount || 0), 0);

      const commissionRows: SaleCommissionRow[] = txCommissions
        .map((c) => {
          const prof = profileMap.get(c.beneficiary_profile_id);
          let beneficiaryName: string | null = prof?.name || null;
          if (!beneficiaryName && c.beneficiary_coach_id) {
            beneficiaryName = nameForCoach(c.beneficiary_coach_id);
          }
          return {
            beneficiaryName,
            slotLabel: c.slot_label,
            level: c.level,
            percentage: Number(c.percentage || 0),
            amount: Number(c.amount || 0),
            status: c.status,
            isMasterCoach: !!c.is_master_coach_commission,
          };
        })
        .sort((a, b) => a.level - b.level);

      return {
        transactionId: t.id,
        createdAt: t.created_at,
        paidAt: t.paid_at,
        status: t.status,
        paymentMethod: t.payment_method,
        installments: Number(t.installments || 1),
        grossAmount: Number(t.gross_amount || 0),
        appFee: Number(t.app_fee || 0),
        paymentFee: Number(t.payment_fee || 0),
        taxAmount: Number(t.tax_amount || 0),
        netAmount: Number(t.net_amount || 0),
        studentName: stuProfile?.name || null,
        studentEmail: stuProfile?.email || null,
        productName: t.product_id ? productMap.get(t.product_id) || null : null,
        sellerCoachName: nameForCoach(stu?.coach_id),
        upline1Name: up1 ? nameForCoach(up1.id) : null,
        upline2Name: up2 ? nameForCoach(up2.id) : null,
        upline3Name: up3 ? nameForCoach(up3.id) : null,
        masterCoachName: null, // could resolve from sellerCoach.master_coach_id if needed
        pointsGenerated: pointsByTx.get(t.id) || 0,
        commissions: commissionRows,
        distributedTotal,
        surplusToSeller: surplus,
        saleChannel: t.purchase_type === "store_order" ? "store" : "coach",
        saleChannelLabel: t.purchase_type === "store_order" ? "Loja (auto)" : "Coach (venda direta)",
        purchaseType: (t.purchase_type as string | null) ?? null,
      };
    });
  });
