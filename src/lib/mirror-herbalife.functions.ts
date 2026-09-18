import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Uma seção e uma categoria só, para a FitMind e para o espelho. Até 29/08
// existia uma "Suplementos > Herbalife" de parceiro (...0002); a fusão
// (20260829190000) a desativou, mas esta função continuou gravando lá, e
// o espelho da Arlete nasceu fora da categoria que o coach consegue esconder.
const HERBALIFE_SECTION = "11111111-0000-0000-0000-000000000001";
const HERBALIFE_CATEGORY = "22222222-0000-0000-0000-000000000001";

type SourceProduct = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  price: number;
  original_price: number | null;
  stock: number | null;
  delivery_days: number | null;
  subcategory_id: string | null;
  sort_order: number | null;
};

/**
 * Migra o catálogo completo de Herbalife (produtos Fitmind na seção Suplementos > Herbalife)
 * para um parceiro ou profissional, criando registros espelho (read-only).
 * Os campos preço/fotos/descrição são copiados no momento e ficam sincronizados via trigger
 * `sync_mirrored_products` sempre que o admin editar o produto original.
 */
export const mirrorHerbalifeCatalog = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(["partner", "professional"]),
        targetId: z.string().uuid(),
      })
      .parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);

    // Buscar todos os produtos Herbalife da Fitmind (fonte)
    const { data: sources, error: srcErr } = await supabaseAdmin
      .from("products")
      .select(
        "id,name,description,image_url,image_urls,price,original_price,stock,delivery_days,subcategory_id,sort_order",
      )
      .eq("section_id", HERBALIFE_SECTION)
      .eq("category_id", HERBALIFE_CATEGORY)
      .eq("status", "active");

    if (srcErr) throw new Error("Falha ao carregar catálogo Herbalife: " + srcErr.message);
    const list = (sources as SourceProduct[] | null) || [];
    if (list.length === 0) {
      return { ok: true, created: 0, skipped: 0, total: 0 };
    }

    const table = data.kind === "partner" ? "partner_products" : "professional_products";
    const ownerCol = data.kind === "partner" ? "partner_id" : "coach_id";

    // Buscar espelhos já existentes para evitar duplicados
    const { data: existingRows } = await supabaseAdmin
      .from(table as never)
      .select("mirror_source_product_id" as never)
      .eq(ownerCol as never, data.targetId as never)
      .not("mirror_source_product_id" as never, "is", null as never);

    const existing = new Set(
      ((existingRows as { mirror_source_product_id: string }[] | null) || []).map(
        (r) => r.mirror_source_product_id,
      ),
    );

    const toInsert = list.filter((p) => !existing.has(p.id));
    if (toInsert.length === 0) {
      return { ok: true, created: 0, skipped: list.length, total: list.length };
    }

    const commonMirrorFields = (p: SourceProduct) => ({
      name: p.name,
      description: p.description,
      image_url: p.image_url,
      image_urls: p.image_urls || [],
      price: Number(p.price || 0),
      original_price: p.original_price,
      stock: p.stock,
      section_id: HERBALIFE_SECTION,
      category_id: HERBALIFE_CATEGORY,
      subcategory_id: p.subcategory_id,
      is_physical: true,
      delivery_days: p.delivery_days ?? 15,
      status: "approved",
      mirror_source_product_id: p.id,
      is_mirrored: true,
      sort_order: p.sort_order ?? 0,
      price_input_mode: "charge",
    });

    let created = 0;
    if (data.kind === "partner") {
      const rows = toInsert.map((p) => ({
        ...commonMirrorFields(p),
        partner_id: data.targetId,
        kind: "paid" as const,
        is_active_by_partner: true,
        coach_commission_percentage: 10,
      }));
      const { error, count } = await supabaseAdmin
        .from("partner_products")
        .insert(rows as never, { count: "exact" });
      if (error) throw new Error("Falha ao criar espelhos: " + error.message);
      created = count ?? rows.length;
    } else {
      const rows = toInsert.map((p) => ({
        ...commonMirrorFields(p),
        coach_id: data.targetId,
        kind: "paid" as const,
        is_active_by_professional: true,
        coach_commission_percentage: 10,
      }));
      const { error, count } = await supabaseAdmin
        .from("professional_products")
        .insert(rows as never, { count: "exact" });
      if (error) throw new Error("Falha ao criar espelhos: " + error.message);
      created = count ?? rows.length;
    }

    return { ok: true, created, skipped: existing.size, total: list.length };
  });

/**
 * Remove todos os espelhos Herbalife de um parceiro ou profissional.
 */
export const unmirrorHerbalifeCatalog = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        kind: z.enum(["partner", "professional"]),
        targetId: z.string().uuid(),
      })
      .parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);

    const table = data.kind === "partner" ? "partner_products" : "professional_products";
    const ownerCol = data.kind === "partner" ? "partner_id" : "coach_id";

    const { error, count } = await supabaseAdmin
      .from(table as never)
      .delete({ count: "exact" })
      .eq(ownerCol as never, data.targetId as never)
      .eq("is_mirrored" as never, true as never);

    if (error) throw new Error("Falha ao remover espelhos: " + error.message);
    return { ok: true, removed: count ?? 0 };
  });
