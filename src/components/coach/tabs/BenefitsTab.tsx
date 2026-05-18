import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Gift, Percent, Building2 } from "lucide-react";

type BenefitRow = { id: string; name: string; description: string | null; discount_info: string | null; coupon_code: string | null; category: string | null; website_url: string | null };

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
  const [benefits, setBenefits] = useState<BenefitRow[]>([]);
  const [partnerFreebies, setPartnerFreebies] = useState<PartnerFreeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<"client" | "coach" | "partners">("partners");
  useEffect(() => {
    (async () => {
      const [b, p] = await Promise.all([
        supabase.from("partner_benefits").select("id,name,description,discount_info,coupon_code,category,website_url").eq("is_active", true).order("sort_order", { ascending: true }),
        supabase
          .from("partner_products" as never)
          .select("id,name,description,image_url,redemption_instructions,stock,partners(fantasy_name,photo_url,city,state,status)" as never)
          .eq("kind" as never, "free" as never)
          .eq("status" as never, "approved" as never)
          .eq("is_active_by_partner" as never, true as never)
          .order("created_at" as never, { ascending: false }),
      ]);
      if (b.error) toast.error("Erro ao carregar benefícios");
      setBenefits((b.data as BenefitRow[]) || []);
      const pf = ((p.data as unknown as PartnerFreeProduct[]) || []).filter((x) => x.partners?.status === "approved");
      setPartnerFreebies(pf);
      setLoading(false);
    })();
  }, []);
  const fallback = benefits.length ? benefits : [
    { id: "showcase", name: "Benefícios para apresentar a clientes", description: "Use esta aba para demonstrar vantagens, bônus e condições comerciais durante a venda.", discount_info: "Material de apoio", coupon_code: "FITMIND", category: "Clientes", website_url: null },
    { id: "coach", name: "Desconto exclusivo Coach", description: "Área reservada para vantagens de compra e parceiros liberados para coaches ativos.", discount_info: "Condição especial", coupon_code: "COACH", category: "Coach", website_url: null },
  ];
  const filtered = fallback.filter((b) => {
    const cat = (b.category || "").toLowerCase();
    if (subTab === "coach") return cat.includes("coach");
    return !cat.includes("coach");
  });
  const visible = filtered.length ? filtered : fallback;
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Gratuitos & Benefícios</h1>
        <p className="text-sm text-white/50">Brindes de empresas parceiras e vantagens comerciais</p>
      </div>
      <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-white/5 p-1 flex-wrap">
        <button
          onClick={() => setSubTab("partners")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${subTab === "partners" ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}
        >
          <Building2 className="h-3.5 w-3.5" /> Empresas parceiras
        </button>
        <button
          onClick={() => setSubTab("client")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${subTab === "client" ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}
        >
          <Gift className="h-3.5 w-3.5" /> Para o cliente
        </button>
        <button
          onClick={() => setSubTab("coach")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${subTab === "coach" ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}
        >
          <Percent className="h-3.5 w-3.5" /> Exclusivo coach
        </button>
      </div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando...</p> : subTab === "partners" ? (
          partnerFreebies.length === 0 ? (
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
          )
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((benefit) => (
              <div key={benefit.id} className="rounded-xl border border-white/5 p-4" style={{ backgroundColor: "#0F0F0F" }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/60">{benefit.category || "Benefício"}</span>
                  {benefit.coupon_code && <span className="rounded-full bg-primary/20 px-2 py-1 font-mono text-[10px] font-bold text-primary">{benefit.coupon_code}</span>}
                </div>
                <h3 className="text-sm font-bold text-white">{benefit.name}</h3>
                <p className="mt-1 text-xs text-white/45">{benefit.description}</p>
                <p className="mt-3 text-sm font-bold text-success">{benefit.discount_info || "Condição especial"}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default CoachBenefitsTab;
