import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const COLUNAS =
  "key, nome, nome_curto, mode, logo_full_url, logo_icon_url, favicon_url, theme_color, background, foreground, card, card_foreground, popover, popover_foreground, primary_color, primary_foreground, secondary, secondary_foreground, muted, muted_foreground, accent, accent_foreground, border, input, ring, sidebar, sidebar_foreground, sidebar_primary, sidebar_primary_foreground, sidebar_accent, sidebar_accent_foreground, sidebar_border, sidebar_ring";

async function exigirAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!me || (me as { role?: string }).role !== "admin") {
    throw new Error("Apenas administradores podem gerenciar a identidade visual.");
  }
  return supabaseAdmin;
}

const temaSchema = z.object({
  key: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen"),
  nome: z.string().min(2),
  nome_curto: z.string().nullable().optional(),
  mode: z.enum(["dark", "light"]),
  logo_full_url: z.string().nullable().optional(),
  logo_icon_url: z.string().nullable().optional(),
  favicon_url: z.string().nullable().optional(),
  theme_color: z.string(),
  background: z.string(),
  foreground: z.string(),
  card: z.string(),
  card_foreground: z.string(),
  popover: z.string(),
  popover_foreground: z.string(),
  primary_color: z.string(),
  primary_foreground: z.string(),
  secondary: z.string(),
  secondary_foreground: z.string(),
  muted: z.string(),
  muted_foreground: z.string(),
  accent: z.string(),
  accent_foreground: z.string(),
  border: z.string(),
  input: z.string(),
  ring: z.string(),
  sidebar: z.string(),
  sidebar_foreground: z.string(),
  sidebar_primary: z.string(),
  sidebar_primary_foreground: z.string(),
  sidebar_accent: z.string(),
  sidebar_accent_foreground: z.string(),
  sidebar_border: z.string(),
  sidebar_ring: z.string(),
});

const salvarSchema = temaSchema.extend({
  /**
   * Salvar mesmo com texto ilegível. Não é atalho: é a saída para o caso em que
   * o admin sabe que aquele par não aparece junto na prática.
   */
  ignorar_contraste: z.boolean().optional(),
});

export type TemaMarcaInput = z.infer<typeof temaSchema>;

export const listAdminBrandThemes = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await exigirAdmin(context.userId);
    const { data } = await supabaseAdmin.from("brand_themes").select(COLUNAS).order("nome");
    return { temas: (data as unknown as TemaMarcaInput[]) || [] };
  });

export const saveBrandTheme = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => salvarSchema.parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await exigirAdmin(context.userId);

    /*
     * A conferência de contraste existia e SÓ AVISAVA.
     *
     * O tema do Reino Muay Thai foi salvo com fundo #ff0000 e primária #ff5252
     * — a auditoria da própria tela reprovava cinco pares, inclusive "texto do
     * destaque" em 2,06:1 e "cor principal x fundo" em 1,25:1 — e nada impediu
     * o save. A academia abriu a tela com botão invisível.
     *
     * Aviso que não segura nada é decoração. Aqui o servidor recusa, e recusa
     * no servidor de propósito: bloquear só no botão deixaria passar qualquer
     * chamada que não fosse por aquele botão.
     *
     * Barra apenas LEGIBILIDADE DE TEXTO (mínimo 4.5). Superfície e borda
     * continuam aviso: o próprio tema FitMind vive perto do piso ali, e
     * reprovar isso travaria o tema padrão da casa.
     */
    const { ignorar_contraste, ...tema } = data;
    if (!ignorar_contraste) {
      const { auditarContraste } = await import("./palette");
      const ilegiveis = auditarContraste(tema).filter((p) => !p.ok && p.minimo >= 4.5);
      if (ilegiveis.length > 0) {
        const lista = ilegiveis
          .map((p) => `${p.label} (${p.razao.toFixed(2)}:1, precisa de ${p.minimo})`)
          .join("; ");
        throw new Error(
          `Texto ilegível em ${ilegiveis.length} combinação(ões): ${lista}. ` +
            "Use \"Corrigir contraste\" ou confirme que quer salvar assim mesmo.",
        );
      }
    }

    const { error } = await supabaseAdmin
      .from("brand_themes")
      .upsert(tema as never, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBrandTheme = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ key: z.string() }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    if (data.key === "fitmind") throw new Error("O tema padrão FitMind não pode ser removido.");
    const supabaseAdmin = await exigirAdmin(context.userId);
    const { error } = await supabaseAdmin.from("brand_themes").delete().eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type AlvoMarca = {
  kind: "coach" | "partner";
  id: string;
  nome: string;
  email: string;
  temaKey: string | null;
};

export const searchBrandTargets = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ q: z.string().default("") }).parse(input ?? {}))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await exigirAdmin(context.userId);
    const termo = data.q.trim();

    let perfilIds: string[] | null = null;
    if (termo) {
      const { data: perfis } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .or(`name.ilike.%${termo}%,email.ilike.%${termo}%`)
        .limit(60);
      perfilIds = ((perfis as Array<{ id: string }> | null) || []).map((p) => p.id);
      if (perfilIds.length === 0) return { alvos: [] as AlvoMarca[] };
    }

    const qCoaches = supabaseAdmin.from("coaches").select("id, profile_id, brand_theme_key").limit(40);
    const qPartners = supabaseAdmin.from("partners").select("id, profile_id, fantasy_name, brand_theme_key").limit(40);
    const [{ data: coaches }, { data: partners }] = await Promise.all([
      perfilIds ? qCoaches.in("profile_id", perfilIds) : qCoaches,
      perfilIds ? qPartners.in("profile_id", perfilIds) : qPartners,
    ]);

    const ids = Array.from(
      new Set([
        ...((coaches as Array<{ profile_id: string }> | null) || []).map((c) => c.profile_id),
        ...((partners as Array<{ profile_id: string }> | null) || []).map((p) => p.profile_id),
      ]),
    );
    const { data: perfis } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, name, email").in("id", ids)
      : { data: [] as Array<{ id: string; name: string | null; email: string | null }> };
    const mapa = new Map(
      ((perfis as Array<{ id: string; name: string | null; email: string | null }> | null) || []).map((p) => [p.id, p]),
    );

    const alvos: AlvoMarca[] = [
      ...((coaches as Array<{ id: string; profile_id: string; brand_theme_key: string | null }> | null) || []).map((c) => ({
        kind: "coach" as const,
        id: c.id,
        nome: mapa.get(c.profile_id)?.name || "—",
        email: mapa.get(c.profile_id)?.email || "—",
        temaKey: c.brand_theme_key,
      })),
      ...((partners as Array<{ id: string; profile_id: string; fantasy_name: string | null; brand_theme_key: string | null }> | null) || []).map((p) => ({
        kind: "partner" as const,
        id: p.id,
        nome: p.fantasy_name || mapa.get(p.profile_id)?.name || "—",
        email: mapa.get(p.profile_id)?.email || "—",
        temaKey: p.brand_theme_key,
      })),
    ].sort((a, b) => a.nome.localeCompare(b.nome));

    return { alvos };
  });

export const assignBrandTheme = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(["coach", "partner"]),
        id: z.string().uuid(),
        key: z.string().nullable(),
      })
      .parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await exigirAdmin(context.userId);
    const tabela = data.kind === "coach" ? "coaches" : "partners";
    const chave = data.key === "fitmind" ? null : data.key;
    const { error } = await supabaseAdmin
      .from(tabela)
      .update({ brand_theme_key: chave } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
