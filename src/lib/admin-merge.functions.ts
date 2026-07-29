import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export type MergeCandidate = {
  id: string;
  name: string | null;
  email: string | null;
  cpf: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
  createdAt: string | null;
  mergedIntoProfileId: string | null;
  hasCoach: boolean;
  hasStudent: boolean;
  hasPartner: boolean;
};

/** Busca perfis por nome, e-mail, CPF ou telefone (somente admin). */
export const searchProfilesForMerge = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ term: z.string().trim().min(2).max(120) }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<MergeCandidate[]> => {
    const { assertAdminProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);

    const term = data.term.trim();
    const digits = term.replace(/\D/g, "");
    const filters = [`name.ilike.%${term}%`, `email.ilike.%${term}%`];
    if (digits.length >= 4) {
      filters.push(`cpf.ilike.%${digits}%`, `phone.ilike.%${digits}%`);
    }

    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, cpf, phone, role, status, created_at, merged_into_profile_id")
      .or(filters.join(","))
      .limit(25);
    if (error) throw new Error(error.message);

    const ids = (rows || []).map((r) => r.id as string);
    if (!ids.length) return [];

    const [coaches, students, partners] = await Promise.all([
      supabaseAdmin.from("coaches").select("profile_id").in("profile_id", ids),
      supabaseAdmin.from("students").select("profile_id").in("profile_id", ids),
      supabaseAdmin.from("partners").select("profile_id").in("profile_id", ids),
    ]);
    const set = (r: { data: { profile_id: string }[] | null }) =>
      new Set((r.data || []).map((x) => x.profile_id));
    const coachSet = set(coaches as never);
    const studentSet = set(students as never);
    const partnerSet = set(partners as never);

    return (rows || []).map((r) => ({
      id: r.id as string,
      name: (r.name as string) ?? null,
      email: (r.email as string) ?? null,
      cpf: (r.cpf as string) ?? null,
      phone: (r.phone as string) ?? null,
      role: (r.role as string) ?? null,
      status: (r.status as string) ?? null,
      createdAt: (r.created_at as string) ?? null,
      mergedIntoProfileId: (r as { merged_into_profile_id?: string | null }).merged_into_profile_id ?? null,
      hasCoach: coachSet.has(r.id as string),
      hasStudent: studentSet.has(r.id as string),
      hasPartner: partnerSet.has(r.id as string),
    }));
  });

/** Executa (ou simula) a mesclagem de dois cadastros. */
export const adminMergeProfiles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ sourceProfileId: uuid, targetProfileId: uuid, dryRun: z.boolean().default(true) }).parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actorProfileId = await assertAdminProfile(context.userId);

    if (data.sourceProfileId === data.targetProfileId) {
      throw new Error("Origem e destino precisam ser cadastros diferentes.");
    }

    const { data: result, error } = await supabaseAdmin.rpc("admin_merge_profiles" as never, {
      p_source: data.sourceProfileId,
      p_target: data.targetProfileId,
      p_actor: actorProfileId,
      p_dry_run: data.dryRun,
    } as never);
    if (error) throw new Error(error.message);

    return { ok: true, dryRun: data.dryRun, result: result as Record<string, unknown> };
  });
