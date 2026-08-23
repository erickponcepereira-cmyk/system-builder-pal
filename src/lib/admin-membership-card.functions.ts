import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CardPersonResult = {
  profileId: string;
  name: string | null;
  email: string | null;
};

export const adminSearchCardPeople = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().min(2).max(120) }).parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<CardPersonResult[]> => {
    const { assertAdminProfile } = await import("./admin-network.server");
    await assertAdminProfile(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const like = `%${data.q.trim()}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .or(`name.ilike.${like},email.ilike.${like}`)
      .order("name", { ascending: true })
      .limit(30);
    if (error) throw new Error(error.message);

    return (rows || []).map((r) => ({
      profileId: r.id,
      name: r.name ?? null,
      email: r.email ?? null,
    }));
  });
