import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

async function assertAuthorized(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) throw new Error("Perfil não encontrado");
  if (profile.role === "admin") return { profileId: profile.id, isAdmin: true };

  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!coach?.id) throw new Error("Acesso negado");

  const { data: badges } = await supabaseAdmin
    .from("coach_badges")
    .select("badge_key")
    .eq("coach_id", coach.id)
    .eq("badge_key", "partnership_master");
  if (!badges || badges.length === 0) throw new Error("Acesso restrito à categoria Mestre de Parcerias");
  return { profileId: profile.id, isAdmin: false };
}

export const listPartnersForApproval = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAuthorized(context.userId);
    const { data, error } = await supabaseAdmin
      .from("partners")
      .select(
        "id, fantasy_name, document, whatsapp, city, state, status, photo_url, cover_url, description, instagram, facebook, website, created_at, approved_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getPartnerDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) =>
    z.object({ partnerId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAuthorized(context.userId);

    const [partnerRes, productsRes, visitsRes, collabsRes] = await Promise.all([
      supabaseAdmin.from("partners").select("*").eq("id", data.partnerId).maybeSingle(),
      supabaseAdmin
        .from("partner_products")
        .select("*")
        .eq("partner_id", data.partnerId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("partner_visits")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", data.partnerId),
      supabaseAdmin
        .from("students")
        .select("id, created_at, profiles!students_profile_id_fkey(name, email, phone, photo_url)")
        .eq("partner_id", data.partnerId)
        .order("created_at", { ascending: false }),
    ]);

    if (partnerRes.error) throw new Error(partnerRes.error.message);
    if (!partnerRes.data) throw new Error("Parceiro não encontrado");

    return {
      partner: partnerRes.data,
      products: productsRes.data ?? [],
      visits: visitsRes.count ?? 0,
      collaborators: collabsRes.data ?? [],
    };
  });

export const reviewPartnerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; status: "approved" | "blocked" | "pending"; reason?: string }) =>
    z
      .object({
        partnerId: z.string().uuid(),
        status: z.enum(["approved", "blocked", "pending"]),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAuthorized(context.userId);
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.blocked_at = null;
      patch.blocked_reason = null;
    } else if (data.status === "blocked") {
      patch.blocked_at = new Date().toISOString();
      patch.blocked_reason = data.reason ?? null;
    } else {
      patch.approved_at = null;
    }
    const { error } = await supabaseAdmin.from("partners").update(patch).eq("id", data.partnerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reviewPartnerProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productId: string; decision: "approved" | "rejected"; notes?: string }) =>
    z
      .object({
        productId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { profileId } = await assertAuthorized(context.userId);
    const patch: Record<string, unknown> = {
      status: data.decision,
      admin_notes: data.notes ?? null,
    };
    if (data.decision === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = profileId;
    }
    const { error } = await supabaseAdmin
      .from("partner_products")
      .update(patch)
      .eq("id", data.productId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
