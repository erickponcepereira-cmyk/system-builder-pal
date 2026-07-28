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

    const { data: unidade } = await supabaseAdmin
      .from("partners")
      .select("fantasy_name")
      .eq("id", data.partnerId)
      .maybeSingle();

    await supabaseAdmin.from("notifications").insert({
      profile_id: alvo.id,
      type: "partner_member",
      title: "Você entrou para uma equipe",
      message: `Você foi adicionado à equipe de ${(unidade as { fantasy_name?: string } | null)?.fantasy_name || "uma unidade parceira"}. Acesse pelo seletor de painel → Parceiro.`,
      action_url: "/partner",
    });

    return { ok: true, name: alvo.name, email };
  });

/**
 * Lista a equipe das unidades do usuário (uma ou todas), com o perfil de cada
 * pessoa na plataforma. Só devolve unidades onde o chamador é dono/gerente
 * com permissão de gerenciar membros (ou admin da plataforma).
 */
export const listPartnerTeam = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ partnerId: z.string().uuid().optional(), todas: z.boolean().optional() })
      .parse(input ?? {}),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!me) throw new Error("Perfil não encontrado.");

    const { data: meus } = await supabaseAdmin
      .from("partner_members")
      .select("partner_id, papel, permissoes")
      .eq("profile_id", me.id as string);

    const gerenciaveis = ((meus as Array<{ partner_id: string; papel: string; permissoes: string[] | null }> | null) || [])
      .filter((m) => m.papel === "owner" || (m.permissoes || []).includes("members.gerenciar"))
      .map((m) => m.partner_id);

    let alvos = data.todas ? gerenciaveis : gerenciaveis.filter((id) => id === data.partnerId);
    if (me.role === "admin" && data.partnerId && !data.todas) alvos = [data.partnerId];
    type MembroEquipe = {
      id: string; profileId: string; papel: "owner" | "manager" | "staff";
      permissoes: string[]; nome: string; email: string; perfis: string[]; desde: string;
    };
    if (alvos.length === 0) return { unidades: [] as Array<{ partnerId: string; fantasyName: string; membros: MembroEquipe[] }> };

    const [{ data: unidades }, { data: linhas }] = await Promise.all([
      supabaseAdmin.from("partners").select("id, fantasy_name").in("id", alvos),
      supabaseAdmin
        .from("partner_members")
        .select("id, partner_id, profile_id, papel, permissoes, created_at")
        .in("partner_id", alvos),
    ]);

    const rows = (linhas as Array<{
      id: string; partner_id: string; profile_id: string; papel: string; permissoes: string[] | null; created_at: string;
    }> | null) || [];
    const perfilIds = Array.from(new Set(rows.map((r) => r.profile_id)));
    const { data: perfis } = perfilIds.length
      ? await supabaseAdmin.from("profiles").select("id, name, email, role").in("id", perfilIds)
      : { data: [] as Array<{ id: string; name: string | null; email: string | null; role: string | null }> };
    const mapaPerfil = new Map(((perfis as Array<{ id: string; name: string | null; email: string | null; role: string | null }> | null) || []).map((p) => [p.id, p]));

    // Coach/profissional para mostrar o "perfil na plataforma" com mais precisão
    const { data: coaches } = perfilIds.length
      ? await supabaseAdmin.from("coaches").select("profile_id, is_professional, approved_at").in("profile_id", perfilIds)
      : { data: [] as Array<{ profile_id: string; is_professional: boolean | null; approved_at: string | null }> };
    const mapaCoach = new Map(((coaches as Array<{ profile_id: string; is_professional: boolean | null; approved_at: string | null }> | null) || []).map((c) => [c.profile_id, c]));

    return {
      unidades: ((unidades as Array<{ id: string; fantasy_name: string | null }> | null) || []).map((u) => ({
        partnerId: u.id,
        fantasyName: u.fantasy_name || "Unidade",
        membros: rows
          .filter((r) => r.partner_id === u.id)
          .map((r) => {
            const perfil = mapaPerfil.get(r.profile_id);
            const coach = mapaCoach.get(r.profile_id);
            const perfis: string[] = [];
            if (perfil?.role === "admin") perfis.push("Admin");
            if (coach) perfis.push(coach.is_professional && coach.approved_at ? "Profissional" : "Coach");
            if (perfil?.role === "partner") perfis.push("Parceiro");
            if (perfis.length === 0) perfis.push("Aluno");
            return {
              id: r.id,
              profileId: r.profile_id,
              papel: r.papel as "owner" | "manager" | "staff",
              permissoes: r.permissoes || [],
              nome: perfil?.name || "—",
              email: perfil?.email || "—",
              perfis,
              desde: r.created_at,
            };
          })
          .sort((a, b) => (a.papel === "owner" ? -1 : b.papel === "owner" ? 1 : a.nome.localeCompare(b.nome))),
      })),
    };
  });
