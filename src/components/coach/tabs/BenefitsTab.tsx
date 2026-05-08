import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Gift, Percent } from "lucide-react";

type BenefitRow = { id: string; name: string; description: string | null; discount_info: string | null; coupon_code: string | null; category: string | null; website_url: string | null };

export function CoachBenefitsTab() {
  const [benefits, setBenefits] = useState<BenefitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<"client" | "coach">("client");
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("partner_benefits").select("id,name,description,discount_info,coupon_code,category,website_url").eq("is_active", true).order("sort_order", { ascending: true });
      if (error) toast.error("Erro ao carregar benefícios");
      setBenefits((data as BenefitRow[]) || []);
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
        <h1 className="text-2xl font-bold text-white">Benefícios</h1>
        <p className="text-sm text-white/50">Vantagens para mostrar aos clientes e descontos exclusivos do coach</p>
      </div>
      <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
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
        {loading ? <p className="text-sm text-white/50">Carregando benefícios...</p> : (
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
