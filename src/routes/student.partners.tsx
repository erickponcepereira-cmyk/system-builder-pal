import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Loader2, MapPin, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/partners")({
  head: () => ({ meta: [{ title: "Empresas Parceiras — FitMind Club" }] }),
  component: PartnersList,
});

interface PartnerCard {
  id: string;
  fantasy_name: string;
  description: string | null;
  photo_url: string | null;
  city: string | null;
  state: string | null;
  free_count: number;
}

function PartnersList() {
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<PartnerCard[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("partners" as never)
        .select("id,fantasy_name,description,photo_url,city,state,status,partner_products(id,kind,status,is_active_by_partner)" as never)
        .eq("status" as never, "approved" as never)
        .order("fantasy_name" as never);
      const rows = ((data as unknown as Array<PartnerCard & { partner_products: Array<{ kind: string; status: string; is_active_by_partner: boolean }> }>) || []).map((p) => ({
        ...p,
        free_count: (p.partner_products || []).filter(
          (x) => x.kind === "free" && x.status === "approved" && x.is_active_by_partner,
        ).length,
      }));
      setPartners(rows);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/5 bg-[#0F0F0F] px-4 py-3">
        <Link to="/student/profile" className="text-white/60"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Empresas Parceiras</h1>
          <p className="text-xs text-white/50">Benefícios e produtos exclusivos</p>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" />
        ) : partners.length === 0 ? (
          <p className="text-center text-sm text-white/50 mt-10">Nenhuma empresa parceira ainda.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {partners.map((p) => (
              <Link
                key={p.id}
                to="/student/partners/$partnerId"
                params={{ partnerId: p.id }}
                className="rounded-2xl border border-white/5 overflow-hidden block"
                style={{ backgroundColor: "#1A1A1A" }}
              >
                <div className="flex gap-3 p-3">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.fantasy_name} className="h-16 w-16 rounded-xl object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-white/5 flex items-center justify-center"><Building2 className="h-6 w-6 text-white/30" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{p.fantasy_name}</p>
                    {(p.city || p.state) && (
                      <p className="text-[10px] text-white/40 flex items-center gap-1"><MapPin className="h-3 w-3" /> {[p.city, p.state].filter(Boolean).join(" / ")}</p>
                    )}
                    {p.description && <p className="mt-1 text-xs text-white/60 line-clamp-2">{p.description}</p>}
                    {p.free_count > 0 && (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary"><Sparkles className="h-3 w-3" /> {p.free_count} benefício{p.free_count > 1 ? "s" : ""} grátis</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
