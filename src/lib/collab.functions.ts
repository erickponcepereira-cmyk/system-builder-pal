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

async function resolveProfileIdFor(supabase: any, ownerType: OwnerType, ownerId: string): Promise<string | null> {
  if (ownerType === "partner") {
    const { data } = await supabase.from("partners").select("profile_id").eq("id", ownerId).maybeSingle();
    return (data as any)?.profile_id ?? null;
  }
  const { data } = await supabase.from("coaches").select("profile_id").eq("id", ownerId).maybeSingle();
  return (data as any)?.profile_id ?? null;
}

async function insertNotification(profileId: string | null, type: string, title: string, message: string, actionUrl: string) {
  if (!profileId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("notifications").insert({
      profile_id: profileId,
      type,
      title,
      message,
      action_url: actionUrl,
    });
  } catch (e) {
    console.error("insertNotification failed", e);
  }
}

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
    const ownerProfileId = await resolveProfileIdFor(supabase, owner.owner_type, owner.owner_id);
    await insertNotification(
      ownerProfileId,
      "calendar_share_request",
      "Nova solicitação de agenda",
      "Alguém pediu acesso à sua agenda. Toque para revisar.",
      owner.owner_type === "partner" ? "/partner?tab=collab" : "/professional?tab=collab",
    );
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
    hasCost?: boolean;
    costAmountBrl?: number;
    costBearer?: "creator" | "collaborator";
    splitBase?: "gross" | "net" | "net_after_cost";
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

    const hasCost = !!data.hasCost;
    let costBearerType: OwnerType | null = null;
    let costBearerId: string | null = null;
    let splitBase: "gross" | "net" | "net_after_cost" = data.splitBase || "net";
    if (hasCost) {
      if (!data.costAmountBrl || data.costAmountBrl <= 0) {
        throw new Error("Informe um valor de custo maior que zero.");
      }
      const bearer = data.costBearer || "creator";
      if (bearer === "creator") {
        costBearerType = data.creatorType;
        costBearerId = data.creatorId;
      } else {
        costBearerType = collabType!;
        costBearerId = collabId!;
      }
      if (splitBase !== "gross" && splitBase !== "net_after_cost") {
        splitBase = "net_after_cost";
      }
    } else {
      if (splitBase === "net_after_cost") splitBase = "net";
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
        has_cost: hasCost,
        cost_amount_brl: hasCost ? data.costAmountBrl : 0,
        cost_bearer_type: costBearerType,
        cost_bearer_id: costBearerId,
        split_base: splitBase,
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    const collabProfileId = await resolveProfileIdFor(supabase, collabType!, collabId!);
    await insertNotification(
      collabProfileId,
      "coproduction_invite",
      "Novo convite de co-produção",
      "Você foi convidado para uma co-produção. Toque para revisar.",
      collabType === "partner" ? "/partner?tab=collab" : "/professional?tab=collab",
    );
    return created;
  });


export const listCoproducerCandidates = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { excludeType: OwnerType; excludeId: string }) => d)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;

    // Descobre o coach_id do usuário logado (se houver) para escopar por rede
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const myProfileId = profile?.id as string | undefined;

    let myCoach: any = null;
    if (myProfileId) {
      const { data: c } = await supabase
        .from("coaches")
        .select("id, upline_coach_id")
        .eq("profile_id", myProfileId)
        .maybeSingle();
      myCoach = c;
    }

    // Conjunto de coaches da rede: eu + upline + downline (até 3 níveis)
    const networkCoachIds = new Set<string>();
    if (myCoach?.id) {
      networkCoachIds.add(myCoach.id);
      if (myCoach.upline_coach_id) networkCoachIds.add(myCoach.upline_coach_id);
      let frontier: string[] = [myCoach.id];
      for (let level = 0; level < 3 && frontier.length; level++) {
        const { data: children } = await supabase
          .from("coaches")
          .select("id, upline_coach_id")
          .in("upline_coach_id", frontier);
        const next: string[] = [];
        (children || []).forEach((c: any) => {
          if (!networkCoachIds.has(c.id)) {
            networkCoachIds.add(c.id);
            next.push(c.id);
          }
        });
        frontier = next;
      }
    }

    const inNetworkIds = Array.from(networkCoachIds);

    let professionalsQuery = supabase
      .from("coaches")
      .select("id, profiles:profile_id(name)")
      .eq("is_professional", true)
      .not("approved_at", "is", null)
      .is("blocked_at", null);
    if (inNetworkIds.length) professionalsQuery = professionalsQuery.in("id", inNetworkIds);

    let partnersQuery = supabase
      .from("partners")
      .select("id, fantasy_name, upline_coach_id")
      .eq("status", "approved")
      .order("fantasy_name");
    if (inNetworkIds.length) partnersQuery = partnersQuery.in("upline_coach_id", inNetworkIds);

    const [partners, professionals] = await Promise.all([partnersQuery, professionalsQuery]);

    const items: { type: OwnerType; id: string; name: string }[] = [];
    (partners.data || []).forEach((p: any) => {
      if (!(data.excludeType === "partner" && data.excludeId === p.id)) {
        items.push({ type: "partner", id: p.id, name: p.fantasy_name || "Parceiro" });
      }
    });
    (professionals.data || []).forEach((c: any) => {
      if (!(data.excludeType === "professional" && data.excludeId === c.id)) {
        items.push({ type: "professional", id: c.id, name: c.profiles?.name || "Profissional" });
      }
    });
    items.sort((a, b) => a.name.localeCompare(b.name));
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

// ---------- coproduced products (read-only view for accepted collaborators) ----------
export const listCoproducedProducts = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { entityType: OwnerType; entityId: string }) => d)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    // Ensure caller actually owns the entity being queried.
    const profileId = await resolveProfileIdFor(supabase, data.entityType, data.entityId);
    if (!profileId) throw new Error("Entidade não encontrada.");
    const { data: myProfile } = await supabase
      .from("profiles").select("id").eq("user_id", context.userId).maybeSingle();
    if (!myProfile || (myProfile as any).id !== profileId) {
      throw new Error("Sem permissão para listar co-produções desta entidade.");
    }
    const { data: rows } = await supabase
      .from("product_coproductions")
      .select("*")
      .eq("collaborator_type", data.entityType)
      .eq("collaborator_id", data.entityId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false });
    const list = (rows || []) as any[];
    if (list.length === 0) return { items: [] };
    // Use admin client to fetch full product rows regardless of RLS.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const partnerProdIds = Array.from(new Set(list.filter((r) => r.product_type === "partner").map((r) => r.product_id)));
    const proProdIds = Array.from(new Set(list.filter((r) => r.product_type === "professional").map((r) => r.product_id)));
    const partnerCreatorIds = Array.from(new Set(list.filter((r) => r.creator_type === "partner").map((r) => r.creator_id)));
    const coachCreatorIds = Array.from(new Set(list.filter((r) => r.creator_type === "professional").map((r) => r.creator_id)));
    const [pp, pr, pt, coRaw] = await Promise.all([
      partnerProdIds.length ? supabaseAdmin.from("partner_products").select("*").in("id", partnerProdIds) : Promise.resolve({ data: [] }),
      proProdIds.length ? supabaseAdmin.from("professional_products").select("*").in("id", proProdIds) : Promise.resolve({ data: [] }),
      partnerCreatorIds.length ? supabaseAdmin.from("partners").select("id,fantasy_name").in("id", partnerCreatorIds) : Promise.resolve({ data: [] }),
      coachCreatorIds.length ? supabaseAdmin.from("coaches").select("id,profile_id").in("id", coachCreatorIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const coachProfileIds = ((coRaw.data as any[]) || []).map((c) => c.profile_id).filter(Boolean);
    const { data: coachProfiles } = coachProfileIds.length
      ? await supabaseAdmin.from("profiles").select("id,name").in("id", coachProfileIds)
      : { data: [] as any[] };
    const findProd = (type: string, id: string) => {
      const arr: any = type === "partner" ? pp.data : pr.data;
      return (arr || []).find((x: any) => x.id === id) || null;
    };
    const creatorName = (type: string, id: string) => {
      if (type === "partner") {
        return (pt.data || []).find((p: any) => p.id === id)?.fantasy_name || "Parceiro";
      }
      const c = ((coRaw.data as any[]) || []).find((x) => x.id === id);
      if (!c) return "Profissional";
      return (coachProfiles || []).find((p: any) => p.id === c.profile_id)?.name || "Profissional";
    };

    const items = list.map((r) => {
      const prod = findProd(r.product_type, r.product_id);
      if (!prod) return null;
      return {
        coproductionId: r.id,
        productType: r.product_type as OwnerType,
        creatorType: r.creator_type as OwnerType,
        creatorId: r.creator_id as string,
        creatorName: creatorName(r.creator_type, r.creator_id),
        splitKind: r.split_kind,
        percentOfNet: r.percent_of_net,
        fixedAmountBrl: r.fixed_amount_brl,
        product: prod,
      };
    }).filter(Boolean);
    return { items };
  });

// ---------- pending badges ----------

export const getCollabPendingCounts = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { entityType: OwnerType; entityId: string }) => d)
  .handler(async ({ context, data }) => {
    const supabase = context.supabase as any;
    const [coprod, shares] = await Promise.all([
      supabase
        .from("product_coproductions")
        .select("id", { count: "exact", head: true })
        .eq("collaborator_type", data.entityType)
        .eq("collaborator_id", data.entityId)
        .eq("status", "pending"),
      supabase
        .from("calendar_shares")
        .select("id", { count: "exact", head: true })
        .eq("owner_type", data.entityType)
        .eq("owner_id", data.entityId)
        .eq("status", "pending"),
    ]);
    const coproductions = Number(coprod.count || 0);
    const calendarShares = Number(shares.count || 0);
    return { coproductions, calendarShares, total: coproductions + calendarShares };
  });
