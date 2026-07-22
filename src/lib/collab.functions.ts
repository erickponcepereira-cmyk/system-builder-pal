import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";

export type OwnerType = "partner" | "professional";

// ---------- entity share codes ----------
export const getMyShareCode = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { ownerType: OwnerType; ownerId: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("entity_share_codes" as never)
      .select("code" as never)
      .eq("owner_type" as never, data.ownerType as never)
      .eq("owner_id" as never, data.ownerId as never)
      .maybeSingle();
    if (row) return { code: (row as { code: string }).code };
    // fallback create (backfill trigger already covers)
    const { data: created, error } = await supabase
      .from("entity_share_codes" as never)
      .insert({ owner_type: data.ownerType, owner_id: data.ownerId, code: Math.random().toString(36).slice(2, 10).toUpperCase() } as never)
      .select("code" as never)
      .single();
    if (error) throw new Error(error.message);
    return { code: (created as unknown as { code: string }).code };
  });

async function resolveByCode(supabase: any, code: string) {
  const { data } = await supabase
    .from("entity_share_codes")
    .select("owner_type,owner_id")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  return data as { owner_type: OwnerType; owner_id: string } | null;
}

// ---------- external appointments ----------
export const listExternalAppointments = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { ownerType: OwnerType; ownerId: string }) => d)
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("external_appointments" as never)
      .select("id,product_name,client_name,client_whatsapp,starts_at,ends_at,notes" as never)
      .eq("owner_type" as never, data.ownerType as never)
      .eq("owner_id" as never, data.ownerId as never)
      .order("starts_at" as never, { ascending: true });
    if (error) throw new Error(error.message);
    return { items: rows || [] };
  });

export const createExternalAppointment = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: {
    ownerType: OwnerType; ownerId: string;
    productName: string; clientName: string; clientWhatsapp?: string;
    startsAt: string; endsAt: string; notes?: string;
  }) => d)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    // conflict check against externals
    const { data: conflict } = await supabase
      .from("external_appointments")
      .select("id")
      .eq("owner_type", data.ownerType)
      .eq("owner_id", data.ownerId)
      .lt("starts_at", data.endsAt)
      .gt("ends_at", data.startsAt)
      .limit(1);
    if (conflict && conflict.length) throw new Error("Este horário conflita com outro compromisso externo.");

    // conflict check against internal (professional_appointments) if applicable
    if (data.ownerType === "professional") {
      const { data: internal } = await supabase
        .from("professional_appointments")
        .select("id")
        .eq("professional_coach_id", data.ownerId)
        .neq("status", "cancelled")
        .lt("starts_at", data.endsAt)
        .gt("ends_at", data.startsAt)
        .limit(1);
      if (internal && internal.length) throw new Error("Este horário conflita com um atendimento da plataforma.");
    }

    const { data: created, error } = await supabase
      .from("external_appointments")
      .insert({
        owner_type: data.ownerType,
        owner_id: data.ownerId,
        product_name: data.productName,
        client_name: data.clientName,
        client_whatsapp: data.clientWhatsapp || null,
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        notes: data.notes || null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const deleteExternalAppointment = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any).from("external_appointments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- calendar shares ----------
export const requestCalendarShare = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { viewerType: OwnerType; viewerId: string; ownerCode: string }) => d)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const owner = await resolveByCode(supabase, data.ownerCode);
    if (!owner) throw new Error("Código não encontrado.");
    if (owner.owner_type === data.viewerType && owner.owner_id === data.viewerId) {
      throw new Error("Você não pode compartilhar sua agenda com você mesmo.");
    }
    const { data: created, error } = await supabase
      .from("calendar_shares")
      .insert({
        owner_type: owner.owner_type, owner_id: owner.owner_id,
        viewer_type: data.viewerType, viewer_id: data.viewerId,
        status: "pending", requested_by: "viewer",
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    return created;
  });

export const listCalendarShares = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { entityType: OwnerType; entityId: string }) => d)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const [incoming, outgoing, sharedWithMe] = await Promise.all([
      supabase.from("calendar_shares").select("*")
        .eq("owner_type", data.entityType).eq("owner_id", data.entityId),
      supabase.from("calendar_shares").select("*")
        .eq("viewer_type", data.entityType).eq("viewer_id", data.entityId),
      supabase.from("calendar_shares").select("*")
        .eq("viewer_type", data.entityType).eq("viewer_id", data.entityId).eq("status", "accepted"),
    ]);
    // enrich with names
    const shares = [...(incoming.data || []), ...(outgoing.data || [])];
    const partnerIds = Array.from(new Set(shares.flatMap((s: any) => [s.owner_type === "partner" ? s.owner_id : null, s.viewer_type === "partner" ? s.viewer_id : null]).filter(Boolean)));
    const coachIds = Array.from(new Set(shares.flatMap((s: any) => [s.owner_type === "professional" ? s.owner_id : null, s.viewer_type === "professional" ? s.viewer_id : null]).filter(Boolean)));
    const [partners, coaches] = await Promise.all([
      partnerIds.length ? supabase.from("partners").select("id,fantasy_name").in("id", partnerIds) : Promise.resolve({ data: [] }),
      coachIds.length ? supabase.from("coaches").select("id,profiles:profile_id(name)").in("id", coachIds) : Promise.resolve({ data: [] }),
    ]);
    const nameOf = (type: string, id: string) => {
      if (type === "partner") return (partners.data || []).find((p: any) => p.id === id)?.fantasy_name || "Parceiro";
      const c = (coaches.data || []).find((c: any) => c.id === id);
      return c?.profiles?.name || "Profissional";
    };
    const wrap = (s: any) => ({ ...s, ownerName: nameOf(s.owner_type, s.owner_id), viewerName: nameOf(s.viewer_type, s.viewer_id) });
    return {
      incoming: (incoming.data || []).map(wrap),
      outgoing: (outgoing.data || []).map(wrap),
      sharedWithMe: (sharedWithMe.data || []).map(wrap),
    };
  });

export const respondCalendarShare = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { id: string; accept: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any).from("calendar_shares").update({
      status: data.accept ? "accepted" : "rejected", responded_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeCalendarShare = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any).from("calendar_shares").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSharedAgenda = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { ownerType: OwnerType; ownerId: string }) => d)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const { data: externals } = await supabase
      .from("external_appointments")
      .select("id,product_name,client_name,starts_at,ends_at")
      .eq("owner_type", data.ownerType).eq("owner_id", data.ownerId)
      .order("starts_at", { ascending: true });
    let internals: any[] = [];
    if (data.ownerType === "professional") {
      const { data: appts } = await supabase
        .from("professional_appointments")
        .select("id,starts_at,ends_at,status,notes")
        .eq("professional_coach_id", data.ownerId).neq("status", "cancelled")
        .order("starts_at", { ascending: true });
      internals = appts || [];
    }
    return { externals: externals || [], internals };
  });

// ---------- co-production ----------
export const listCoproductions = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { entityType: OwnerType; entityId: string }) => d)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const [asCreator, asCollab] = await Promise.all([
      supabase.from("product_coproductions").select("*")
        .eq("creator_type", data.entityType).eq("creator_id", data.entityId)
        .order("created_at", { ascending: false }),
      supabase.from("product_coproductions").select("*")
        .eq("collaborator_type", data.entityType).eq("collaborator_id", data.entityId)
        .order("created_at", { ascending: false }),
    ]);
    // hydrate product names
    const rows = [...(asCreator.data || []), ...(asCollab.data || [])];
    const partnerProdIds = Array.from(new Set(rows.filter((r: any) => r.product_type === "partner").map((r: any) => r.product_id)));
    const proProdIds = Array.from(new Set(rows.filter((r: any) => r.product_type === "professional").map((r: any) => r.product_id)));
    const partnerIds = Array.from(new Set(rows.flatMap((r: any) => [r.creator_type === "partner" ? r.creator_id : null, r.collaborator_type === "partner" ? r.collaborator_id : null]).filter(Boolean)));
    const coachIds = Array.from(new Set(rows.flatMap((r: any) => [r.creator_type === "professional" ? r.creator_id : null, r.collaborator_type === "professional" ? r.collaborator_id : null]).filter(Boolean)));
    const [pp, pr, pt, co] = await Promise.all([
      partnerProdIds.length ? supabase.from("partner_products").select("id,name").in("id", partnerProdIds) : Promise.resolve({ data: [] }),
      proProdIds.length ? supabase.from("professional_products").select("id,name").in("id", proProdIds) : Promise.resolve({ data: [] }),
      partnerIds.length ? supabase.from("partners").select("id,fantasy_name").in("id", partnerIds) : Promise.resolve({ data: [] }),
      coachIds.length ? supabase.from("coaches").select("id,profiles:profile_id(name)").in("id", coachIds) : Promise.resolve({ data: [] }),
    ]);
    const nameOfProduct = (type: string, id: string) => {
      const arr: any = type === "partner" ? pp.data : pr.data;
      return (arr || []).find((x: any) => x.id === id)?.name || "Produto";
    };
    const nameOf = (type: string, id: string) => type === "partner"
      ? (pt.data || []).find((p: any) => p.id === id)?.fantasy_name || "Parceiro"
      : (co.data || []).find((c: any) => c.id === id)?.profiles?.name || "Profissional";
    const wrap = (r: any) => ({
      ...r,
      productName: nameOfProduct(r.product_type, r.product_id),
      creatorName: nameOf(r.creator_type, r.creator_id),
      collaboratorName: nameOf(r.collaborator_type, r.collaborator_id),
    });
    return { asCreator: (asCreator.data || []).map(wrap), asCollab: (asCollab.data || []).map(wrap) };
  });

export const inviteCoproducer = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: {
    productType: OwnerType; productId: string;
    creatorType: OwnerType; creatorId: string;
    collaboratorCode?: string;
    collaboratorType?: OwnerType;
    collaboratorId?: string;
    splitKind: "percent" | "fixed";
    percentOfNet?: number;
    fixedAmountBrl?: number;
  }) => d)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    let collabType: OwnerType | null = null;
    let collabId: string | null = null;
    if (data.collaboratorType && data.collaboratorId) {
      collabType = data.collaboratorType;
      collabId = data.collaboratorId;
    } else if (data.collaboratorCode) {
      const collab = await resolveByCode(supabase, data.collaboratorCode);
      if (!collab) throw new Error("Código do colaborador não encontrado.");
      collabType = collab.owner_type;
      collabId = collab.owner_id;
    } else {
      throw new Error("Selecione um coprodutor ou informe o código.");
    }
    if (collabType === data.creatorType && collabId === data.creatorId) {
      throw new Error("Você não pode se convidar como coprodutor.");
    }
    if (data.splitKind === "percent") {
      if (!data.percentOfNet || data.percentOfNet <= 0 || data.percentOfNet > 100) {
        throw new Error("Informe uma porcentagem entre 0 e 100.");
      }
    } else {
      if (!data.fixedAmountBrl || data.fixedAmountBrl <= 0) {
        throw new Error("Informe um valor maior que zero.");
      }
    }
    const { data: created, error } = await supabase
      .from("product_coproductions")
      .insert({
        product_type: data.productType, product_id: data.productId,
        creator_type: data.creatorType, creator_id: data.creatorId,
        collaborator_type: collabType, collaborator_id: collabId,
        split_kind: data.splitKind,
        percent_of_net: data.splitKind === "percent" ? data.percentOfNet : null,
        fixed_amount_brl: data.splitKind === "fixed" ? data.fixedAmountBrl : 0,
        status: "pending",
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    return created;
  });

export const listCoproducerCandidates = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { excludeType: OwnerType; excludeId: string }) => d)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const [partners, coaches] = await Promise.all([
      supabase.from("partners").select("id,fantasy_name").eq("status", "approved").order("fantasy_name"),
      supabase.from("coaches").select("id,role,profiles:profile_id(name)").eq("role", "professional"),
    ]);
    const items: { type: OwnerType; id: string; name: string }[] = [];
    (partners.data || []).forEach((p: any) => {
      if (!(data.excludeType === "partner" && data.excludeId === p.id)) {
        items.push({ type: "partner", id: p.id, name: p.fantasy_name || "Parceiro" });
      }
    });
    (coaches.data || []).forEach((c: any) => {
      if (!(data.excludeType === "professional" && data.excludeId === c.id)) {
        items.push({ type: "professional", id: c.id, name: c.profiles?.name || "Profissional" });
      }
    });
    return { items };
  });

export const respondCoproduction = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { id: string; accept: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any).from("product_coproductions").update({
      status: data.accept ? "accepted" : "rejected", responded_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelCoproduction = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any).from("product_coproductions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listProductCoproductions = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { productType: OwnerType; productId: string }) => d)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const { data: rows } = await supabase
      .from("product_coproductions")
      .select("*")
      .eq("product_type", data.productType).eq("product_id", data.productId);
    const items = rows || [];
    const partnerIds = items.filter((r: any) => r.collaborator_type === "partner").map((r: any) => r.collaborator_id);
    const coachIds = items.filter((r: any) => r.collaborator_type === "professional").map((r: any) => r.collaborator_id);
    const [pt, co] = await Promise.all([
      partnerIds.length ? supabase.from("partners").select("id,fantasy_name").in("id", partnerIds) : Promise.resolve({ data: [] }),
      coachIds.length ? supabase.from("coaches").select("id,profiles:profile_id(name)").in("id", coachIds) : Promise.resolve({ data: [] }),
    ]);
    return {
      items: items.map((r: any) => ({
        ...r,
        collaboratorName: r.collaborator_type === "partner"
          ? (pt.data || []).find((p: any) => p.id === r.collaborator_id)?.fantasy_name || "Parceiro"
          : (co.data || []).find((c: any) => c.id === r.collaborator_id)?.profiles?.name || "Profissional",
      })),
    };
  });
