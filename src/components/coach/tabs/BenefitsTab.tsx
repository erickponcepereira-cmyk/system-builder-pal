import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Building2 } from "lucide-react";

type PartnerFreeProduct = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  redemption_instructions: string | null;
  stock: number | null;
  partners: { fantasy_name: string; photo_url: string | null; city: string | null; state: string | null; status: string } | null;
};

export function CoachBenefitsTab() {
  const [partnerFreebies, setPartnerFreebies] = useState<PartnerFreeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("partner_products" as never)
        .select("id,name,description,image_url,redemption_instructions,stock,partners(fantasy_name,photo_url,city,state,status)" as never)
        .eq("kind" as never, "free" as never)
        .eq("status" as never, "approved" as never)
        .eq("is_active_by_partner" as never, true as never)
        .order("created_at" as never, { ascending: false });
      const pf = ((data as unknown as PartnerFreeProduct[]) || []).filter((x) => x.partners?.status === "approved");
      setPartnerFreebies(pf);
      setLoading(false);
    })();
  }, []);
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Gratuitos</h1>
        <p className="text-sm text-white/50">Brindes de empresas parceiras aprovados pelo admin</p>
      </div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando...</p> : partnerFreebies.length === 0 ? (
          <p className="text-sm text-white/50">Nenhum brinde de empresa parceira disponível no momento.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {partnerFreebies.map((p) => (
              <div key={p.id} className="rounded-xl border border-white/5 overflow-hidden" style={{ backgroundColor: "#0F0F0F" }}>
                {p.image_url && <img src={p.image_url} alt={p.name} className="h-32 w-full object-cover" />}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-white">{p.name}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary uppercase">Grátis</span>
                  </div>
                  <p className="mt-1 text-[11px] text-white/50 flex items-center gap-1"><Building2 className="h-3 w-3" /> {p.partners?.fantasy_name}{p.partners?.city ? ` · ${p.partners.city}/${p.partners.state || ""}` : ""}</p>
                  {p.description && <p className="mt-2 text-xs text-white/60 line-clamp-3">{p.description}</p>}
                  {p.redemption_instructions && <p className="mt-2 text-[11px] text-yellow-400/80 line-clamp-2">⚠ {p.redemption_instructions}</p>}
                  {p.stock !== null && <p className="mt-2 text-[10px] text-white/40">Estoque: {p.stock}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default CoachBenefitsTab;
