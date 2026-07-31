import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const COLUNAS_PADRAO = [
  { nome: "Novo contato", tipo: "normal" },
  { nome: "Contato feito", tipo: "normal" },
  { nome: "Aula experimental", tipo: "normal" },
  { nome: "Negociando", tipo: "normal" },
  { nome: "Matriculado", tipo: "ganho" },
  { nome: "Perdido", tipo: "perdido" },
];

type Admin = Awaited<ReturnType<typeof getAdmin>>;

async function getAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile || profile.role !== "admin") throw new Error("Acesso restrito ao admin");
  return { supabaseAdmin, profileId: profile.id };
}

export type CrmTarget = {
  id: string;          // partner.id (parceiro) ou profile.id (profissional)
  nome: string;
  subtitulo: string | null;
  escopo: "parceiro" | "profissional";
  quadroId: string | null;
  arquivadoEm: string | null;
};

export const listCrmTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin }: Admin = await getAdmin(context.userId);

    const [parceirosRes, profissionaisRes, quadrosRes] = await Promise.all([
      supabaseAdmin
        .from("partners")
        .select("id, fantasy_name, city, state, status, business_area")
        .order("fantasy_name"),
      supabaseAdmin
        .from("coaches")
        .select("id, profile_id, specialty_key, approved_at, profiles:profiles!coaches_profile_id_fkey(id, name, email, city, state)")
        .eq("is_professional", true),
      supabaseAdmin
        .from("crm_quadros" as never)
        .select("id, nome, owner_id, escopo, arquivado_em"),
    ]);

    if (parceirosRes.error) throw new Error(parceirosRes.error.message);
    if (profissionaisRes.error) throw new Error(profissionaisRes.error.message);
    if (quadrosRes.error) throw new Error(quadrosRes.error.message);

    const quadros = (quadrosRes.data ?? []) as unknown as Array<{
      id: string; owner_id: string | null; escopo: string; arquivado_em: string | null;
    }>;
    const acharQuadro = (escopo: string, ownerId: string) =>
      quadros.find((q) => q.escopo === escopo && q.owner_id === ownerId) ?? null;

    const parceiros: CrmTarget[] = (parceirosRes.data ?? []).map((p) => {
      const q = acharQuadro("parceiro", p.id);
      return {
        id: p.id,
        nome: p.fantasy_name ?? "Sem nome",
        subtitulo: [[p.city, p.state].filter(Boolean).join(" · ") || null, p.business_area, p.status]
          .filter(Boolean)
          .join(" · ") || null,
        escopo: "parceiro" as const,
        quadroId: q?.id ?? null,
        arquivadoEm: q?.arquivado_em ?? null,
      };
    });

    const profissionais: CrmTarget[] = (profissionaisRes.data ?? [])
      .map((c) => {
        const prof = (c as unknown as { profiles: { id: string; name: string | null; email: string | null; city: string | null; state: string | null } | null }).profiles;
        if (!prof) return null;
        const q = acharQuadro("profissional", prof.id);
        return {
          id: prof.id,
          nome: prof.name || prof.email || "Profissional",
          subtitulo: [[prof.city, prof.state].filter(Boolean).join(" · ") || null, (c as { specialty_key: string | null }).specialty_key, (c as { approved_at: string | null }).approved_at ? "aprovado" : "pendente"]
            .filter(Boolean)
            .join(" · ") || null,
          escopo: "profissional" as const,
          quadroId: q?.id ?? null,
          arquivadoEm: q?.arquivado_em ?? null,
        };
      })
      .filter(Boolean) as CrmTarget[];

    profissionais.sort((a, b) => a.nome.localeCompare(b.nome));

    return { parceiros, profissionais };
  });

export const ativarCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      escopo: z.enum(["parceiro", "profissional"]),
      ownerId: z.string().uuid(),
      nome: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin, profileId }: Admin = await getAdmin(context.userId);

    const { data: existente } = await supabaseAdmin
      .from("crm_quadros" as never)
      .select("id")
      .eq("escopo" as never, data.escopo as never)
      .eq("owner_id" as never, data.ownerId as never)
      .maybeSingle();
    if (existente) return { quadroId: (existente as unknown as { id: string }).id, jaExistia: true };

    const { data: quadro, error } = await supabaseAdmin
      .from("crm_quadros" as never)
      .insert({ escopo: data.escopo, owner_id: data.ownerId, nome: `CRM — ${data.nome}`, criado_por: profileId } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const quadroId = (quadro as unknown as { id: string }).id;
    const { error: erroColunas } = await supabaseAdmin.from("crm_colunas" as never).insert(
      COLUNAS_PADRAO.map((c, i) => ({ quadro_id: quadroId, nome: c.nome, tipo: c.tipo, posicao: (i + 1) * 1000 })) as never,
    );
    if (erroColunas) throw new Error(erroColunas.message);

    return { quadroId, jaExistia: false };
  });

export const alternarCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ quadroId: z.string().uuid(), ativar: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin }: Admin = await getAdmin(context.userId);
    const arquivado_em = data.ativar ? null : new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("crm_quadros" as never)
      .update({ arquivado_em } as never)
      .eq("id" as never, data.quadroId as never);
    if (error) throw new Error(error.message);
    return { arquivadoEm: arquivado_em };
  });

/** Quadro ativo do dono logado (parceiro por partner_id, profissional por profile_id). */
export const meuQuadroCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ escopo: z.enum(["parceiro", "profissional"]), ownerId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: q } = await supabaseAdmin
      .from("crm_quadros" as never)
      .select("id, arquivado_em")
      .eq("escopo" as never, data.escopo as never)
      .eq("owner_id" as never, data.ownerId as never)
      .maybeSingle();
    const row = q as unknown as { id: string; arquivado_em: string | null } | null;
    if (!row || row.arquivado_em) return { quadroId: null as string | null };
    return { quadroId: row.id };
  });
