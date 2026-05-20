import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";


async function resolveCoachId(userId: string): Promise<string> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.id) throw new Error("Perfil não encontrado");
  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!coach?.id) throw new Error("Coach não encontrado");
  return coach.id;
}

const TreeSchema = z.record(
  z.string(),
  z.object({
    id: z.string(),
    nome: z.string(),
    vendas: z.number().int().min(0),
    parentId: z.string().nullable(),
  })
);

export const getNetworkProjection = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { productId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const coachId = await resolveCoachId(context.userId);
    let q = supabaseAdmin
      .from("coach_network_projections")
      .select("id, product_id, vendas_coach, tree, updated_at")
      .eq("coach_id", coachId);
    q = data.productId ? q.eq("product_id", data.productId) : q.is("product_id", null);
    const { data: row } = await q.maybeSingle();
    return row ?? null;
  });

export const saveNetworkProjection = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { productId?: string | null; vendasCoach: number; tree: unknown }) =>
    z
      .object({
        productId: z.string().uuid().nullable().optional(),
        vendasCoach: z.number().int().min(0).max(100000),
        tree: TreeSchema,
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const coachId = await resolveCoachId(context.userId);
    const { error } = await supabaseAdmin
      .from("coach_network_projections")
      .upsert(
        {
          coach_id: coachId,
          product_id: data.productId ?? null,
          vendas_coach: data.vendasCoach,
          tree: data.tree,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "coach_id,product_id" }
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSimulatorProducts = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, price, commission_coach, commission_level1, commission_level2, commission_level3"
      )
      .eq("status", "active")
      .order("price", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price ?? 0),
      commission_coach: Number(p.commission_coach ?? 50),
      commission_level1: Number(p.commission_level1 ?? 15),
      commission_level2: Number(p.commission_level2 ?? 5),
      commission_level3: Number(p.commission_level3 ?? 3),
    }));
  });
