import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Adiciona um membro à unidade de parceiro pelo e-mail.
 * A busca é feita no servidor (perfis + contas de autenticação), porque
 * o RLS impede o parceiro de enxergar o perfil de outra pessoa pelo e-mail.
 */
export const addPartnerMemberByEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        partnerId: z.string().uuid(),
        email: z.string().email(),
      })
      .parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    // Perfil de quem está chamando
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!me) throw new Error("Perfil não encontrado.");

    // Precisa ser dono/gerente com permissão nesta unidade (ou admin da plataforma)
    if (me.role !== "admin") {
      const { data: membro } = await supabaseAdmin
        .from("partner_members")
        .select("papel, permissoes")
        .eq("partner_id", data.partnerId)
        .eq("profile_id", me.id as string)
        .maybeSingle();
      const permissoes = (membro?.permissoes as string[] | null) || [];
      const autorizado =
        membro?.papel === "owner" || permissoes.includes("members.gerenciar");
      if (!autorizado) throw new Error("Você não pode gerenciar membros desta unidade.");
    }

    // Localiza o perfil alvo pelo e-mail (perfis primeiro, depois contas de auth)
    let alvo: { id: string; name: string | null } | null = null;
    const { data: perfil } = await supabaseAdmin
      .from("profiles")
      .select("id, name")
      .ilike("email", email)
      .maybeSingle();
    if (perfil) {
      alvo = { id: perfil.id as string, name: (perfil.name as string) ?? null };
    } else {
      for (let page = 1; page <= 10 && !alvo; page++) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        const users = list?.users || [];
        const hit = users.find((u) => (u.email || "").toLowerCase() === email);
        if (hit) {
          const { data: p } = await supabaseAdmin
            .from("profiles")
            .select("id, name")
            .eq("user_id", hit.id)
            .maybeSingle();
          if (p) alvo = { id: p.id as string, name: (p.name as string) ?? null };
        }
        if (users.length < 1000) break;
      }
    }

    if (!alvo) {
      throw new Error("Nenhuma conta com esse e-mail. Peça para a pessoa se cadastrar primeiro no app.");
    }

    const { data: jaExiste } = await supabaseAdmin
      .from("partner_members")
      .select("id")
      .eq("partner_id", data.partnerId)
      .eq("profile_id", alvo.id)
      .maybeSingle();
    if (jaExiste) throw new Error("Essa pessoa já faz parte desta unidade.");

    const { error } = await supabaseAdmin.from("partner_members").insert({
      partner_id: data.partnerId,
      profile_id: alvo.id,
      papel: "staff",
      permissoes: ["overview.ver"],
    });
    if (error) throw new Error(error.message);

    return { ok: true, name: alvo.name, email };
  });
