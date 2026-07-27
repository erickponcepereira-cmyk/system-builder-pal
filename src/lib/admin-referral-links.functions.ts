import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReferralLinkRow = {
  entityId: string;
  profileId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  kind: "coach" | "partner" | "student";
  code: string;
  path: string;
};

/**
 * Lista todos os códigos/links de indicação da plataforma (coach, parceiro, aluno).
 * Somente admin.
 */
export const listAllReferralLinks = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdminProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);

    const [coachesRes, partnersRes, studentsRes] = await Promise.all([
      supabaseAdmin
        .from("coaches")
        .select("id, profile_id, referral_code, profiles:profile_id(name, email, phone)")
        .not("referral_code", "is", null),
      supabaseAdmin
        .from("partners")
        .select("id, profile_id, referral_code, fantasy_name, profiles:profile_id(name, email, phone)")
        .not("referral_code", "is", null),
      supabaseAdmin
        .from("students")
        .select("id, profile_id, referral_code, profiles:profile_id(name, email, phone)")
        .not("referral_code", "is", null),
    ]);

    const rows: ReferralLinkRow[] = [];

    const push = (
      kind: ReferralLinkRow["kind"],
      list: unknown[] | null,
      nameFallback?: (r: Record<string, unknown>) => string,
    ) => {
      for (const raw of (list || []) as Record<string, unknown>[]) {
        const code = (raw.referral_code as string | null) || "";
        if (!code) continue;
        const prof = raw.profiles as { name?: string; email?: string; phone?: string } | null;
        rows.push({
          entityId: raw.id as string,
          profileId: (raw.profile_id as string | null) ?? null,
          name: prof?.name || nameFallback?.(raw) || "Sem nome",
          email: prof?.email ?? null,
          phone: prof?.phone ?? null,
          kind,
          code,
          path: `/r/${code}`,
        });
      }
    };

    push("coach", coachesRes.data as unknown[]);
    push("partner", partnersRes.data as unknown[], (r) => (r.fantasy_name as string) || "Parceiro");
    push("student", studentsRes.data as unknown[]);

    rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return { rows };
  });
