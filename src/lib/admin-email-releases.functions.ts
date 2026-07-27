import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UnconfirmedUserRow = {
  userId: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  provider: string;
  profileId: string | null;
  name: string | null;
  role: string | null;
};

/** Lista contas de autenticação com e-mail ainda não confirmado. Somente admin. */
export const listUnconfirmedUsers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ search: z.string().max(120).optional() }).parse(input ?? {}),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);

    const pending: UnconfirmedUserRow[] = [];
    const perPage = 1000;
    for (let page = 1; page <= 10; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);
      const users = list?.users || [];
      for (const u of users) {
        if (u.email_confirmed_at) continue;
        pending.push({
          userId: u.id,
          email: u.email || "",
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
          provider: (u.app_metadata?.provider as string) || "email",
          profileId: null,
          name: null,
          role: null,
        });
      }
      if (users.length < perPage) break;
    }

    if (pending.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id, name, role")
        .in("user_id", pending.map((p) => p.userId));
      const map = new Map((profiles || []).map((p) => [p.user_id as string, p]));
      for (const row of pending) {
        const p = map.get(row.userId);
        if (p) {
          row.profileId = p.id as string;
          row.name = (p.name as string) ?? null;
          row.role = (p.role as string) ?? null;
        }
      }
    }

    const q = (data.search || "").trim().toLowerCase();
    const rows = q
      ? pending.filter(
          (r) => r.email.toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q),
        )
      : pending;

    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { rows };
  });

/** Confirma manualmente o e-mail de uma conta pelo user_id do Auth. Somente admin. */
export const confirmUserEmailByUserId = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email_confirm: true,
    });
    if (error) throw new Error(`Não foi possível confirmar o e-mail: ${error.message}`);

    // Garante que o perfil não fique preso em "pending" por causa do e-mail.
    await supabaseAdmin
      .from("profiles")
      .update({ status: "active" })
      .eq("user_id", data.userId)
      .eq("status", "blocked");

    return { ok: true };
  });

/** Define uma senha temporária e obriga a troca no próximo login. Somente admin. */
export const adminSetTemporaryPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8).max(72) }).parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("profiles")
      .update({ must_reset_password: true })
      .eq("user_id", data.userId);

    return { ok: true };
  });
