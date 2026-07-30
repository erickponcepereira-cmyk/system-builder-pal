import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";

export type ProductContact = {
  whatsapp: string | null;
  sellerName: string | null;
};

/**
 * Resolve o WhatsApp da empresa (parceiro/profissional) dona do produto,
 * com fallback para o número oficial FitMind (app_settings.fitmind_whatsapp).
 */
export const getProductContact = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => d as { productId: string; kind: "partner" | "professional" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ data }): Promise<ProductContact> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let whatsapp: string | null = null;
    let sellerName: string | null = null;

    if (data.kind === "partner") {
      const { data: prod } = await supabaseAdmin
        .from("partner_products")
        .select("partner_id")
        .eq("id", data.productId)
        .maybeSingle();
      const partnerId = (prod as { partner_id?: string } | null)?.partner_id;
      if (partnerId) {
        const { data: p } = await supabaseAdmin
          .from("partners")
          .select("fantasy_name,whatsapp,public_whatsapp")
          .eq("id", partnerId)
          .maybeSingle();
        const row = p as { fantasy_name?: string; whatsapp?: string | null; public_whatsapp?: string | null } | null;
        whatsapp = row?.public_whatsapp || row?.whatsapp || null;
        sellerName = row?.fantasy_name || null;
      }
    } else {
      const { data: prod } = await supabaseAdmin
        .from("professional_products")
        .select("coach_id")
        .eq("id", data.productId)
        .maybeSingle();
      const coachId = (prod as { coach_id?: string } | null)?.coach_id;
      if (coachId) {
        const { data: c } = await supabaseAdmin
          .from("coaches")
          .select("profile_id")
          .eq("id", coachId)
          .maybeSingle();
        const profileId = (c as { profile_id?: string } | null)?.profile_id;
        if (profileId) {
          const [{ data: pub }, { data: prof }] = await Promise.all([
            supabaseAdmin
              .from("professional_public_profile")
              .select("public_whatsapp")
              .eq("profile_id", profileId)
              .maybeSingle(),
            supabaseAdmin.from("profiles").select("name,phone").eq("id", profileId).maybeSingle(),
          ]);
          whatsapp =
            (pub as { public_whatsapp?: string | null } | null)?.public_whatsapp ||
            (prof as { phone?: string | null } | null)?.phone ||
            null;
          sellerName = (prof as { name?: string } | null)?.name || null;
        }
      }
    }

    if (!whatsapp) {
      const { data: setting } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "fitmind_whatsapp")
        .maybeSingle();
      whatsapp = (setting as { value?: string } | null)?.value || null;
    }

    return { whatsapp, sellerName };
  });
