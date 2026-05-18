import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Gift, Loader2, ArrowLeft, CheckCircle2, Clock, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/freebies")({
  head: () => ({ meta: [{ title: "Gratuitos — FitMind Club" }] }),
  component: StudentFreebies,
});

type Freebie = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  kind: "physical" | "digital";
  stock: number | null;
  per_student_limit: number;
  valid_until: string | null;
  condition_note: string | null;
};

type Redemption = {
  id: string;
  freebie_id: string;
  status: string;
  created_at: string;
  freebies: { name: string } | null;
};

type PartnerFreeProduct = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  redemption_instructions: string | null;
  stock: number | null;
  partner_id: string;
  partners: { fantasy_name: string; photo_url: string | null; status: string } | null;
};

function StudentFreebies() {
  const [items, setItems] = useState<Freebie[]>([]);
  const [mine, setMine] = useState<Redemption[]>([]);
  const [partnerFreebies, setPartnerFreebies] = useState<PartnerFreeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [a, b, c] = await Promise.all([
      supabase.from("freebies" as never).select("*").eq("is_active" as never, true).order("sort_order"),
      supabase.from("freebie_redemptions" as never).select("id,freebie_id,status,created_at,freebies(name)" as never).order("created_at" as never, { ascending: false }),
      supabase
        .from("partner_products" as never)
        .select("id,name,description,image_url,redemption_instructions,stock,partner_id,partners(fantasy_name,photo_url,status)" as never)
        .eq("kind" as never, "free" as never)
        .eq("status" as never, "approved" as never)
        .eq("is_active_by_partner" as never, true as never)
        .order("created_at" as never, { ascending: false }),
    ]);
    setItems((a.data as unknown as Freebie[]) || []);
    setMine((b.data as unknown as Redemption[]) || []);
    const pf = ((c.data as unknown as PartnerFreeProduct[]) || []).filter((p) => p.partners?.status === "approved");
    setPartnerFreebies(pf);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const redeem = async (id: string) => {
    setRedeeming(id);
    const { error } = await supabase.rpc("redeem_freebie" as never, { _freebie_id: id } as never);
    setRedeeming(null);
    if (error) return toast.error(error.message);
    toast.success("Brinde resgatado!");
    load();
  };

  const countMine = (id: string) => mine.filter((r) => r.freebie_id === id && r.status !== "cancelled").length;

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/5 bg-[#0F0F0F] px-4 py-3">
        <Link to="/student/store" className="text-white/60"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> Gratuitos</h1>
          <p className="text-xs text-white/50">Brindes e bônus para você resgatar</p>
        </div>
        <Link to="/student/partners" className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary text-[10px] font-bold px-3 py-1.5">
          <Building2 className="h-3.5 w-3.5" /> Parceiros
        </Link>
      </div>

      <div className="p-4">
        {loading ? <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" /> : (
          <>
            {items.length === 0 && partnerFreebies.length === 0 && <p className="text-center text-sm text-white/50 mt-10">Nenhum brinde disponível no momento.</p>}

            {partnerFreebies.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Brindes de empresas parceiras</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {partnerFreebies.map((p) => (
                    <Link key={p.id} to="/student/partners/$partnerId" params={{ partnerId: p.partner_id }} className="rounded-2xl overflow-hidden border border-white/5 block" style={{ backgroundColor: "#1A1A1A" }}>
                      {p.image_url && <img src={p.image_url} alt={p.name} className="h-40 w-full object-cover" />}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-white">{p.name}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary uppercase">Grátis</span>
                        </div>
                        <p className="mt-1 text-[11px] text-white/40">{p.partners?.fantasy_name}</p>
                        {p.description && <p className="mt-1 text-xs text-white/60 line-clamp-2">{p.description}</p>}
                        {p.redemption_instructions && <p className="mt-2 text-[11px] text-yellow-400/80 line-clamp-2">⚠ {p.redemption_instructions}</p>}
                        {p.stock !== null && <p className="mt-2 text-[10px] text-white/40">Estoque: {p.stock}</p>}
                        <div className="mt-3 w-full rounded-lg bg-primary/15 py-2 text-center text-sm font-semibold text-primary">Ver na empresa</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((it) => {
                const taken = countMine(it.id);
                const limitReached = taken >= it.per_student_limit;
                const outOfStock = it.stock !== null && it.stock <= 0;
                const expired = it.valid_until && new Date(it.valid_until) < new Date();
                const disabled = limitReached || outOfStock || !!expired || redeeming === it.id;
                return (
                  <div key={it.id} className="rounded-2xl overflow-hidden border border-white/5" style={{ backgroundColor: "#1A1A1A" }}>
                    {it.image_url && <img src={it.image_url} alt={it.name} className="h-40 w-full object-cover" />}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-white">{it.name}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary uppercase">{it.kind === "digital" ? "Digital" : "Físico"}</span>
                      </div>
                      {it.description && <p className="mt-1 text-xs text-white/60">{it.description}</p>}
                      {it.condition_note && <p className="mt-2 text-[11px] text-yellow-400/80">⚠ {it.condition_note}</p>}
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-white/40">
                        {it.stock !== null && <span>Estoque: {it.stock}</span>}
                        <span>Limite: {it.per_student_limit}</span>
                        {it.valid_until && <span>Até {new Date(it.valid_until).toLocaleDateString("pt-BR")}</span>}
                      </div>
                      <button
                        disabled={disabled}
                        onClick={() => redeem(it.id)}
                        className="mt-3 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {redeeming === it.id ? "Resgatando..." :
                         expired ? "Expirado" :
                         outOfStock ? "Esgotado" :
                         limitReached ? "Já resgatado" :
                         "Resgatar grátis"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {mine.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-bold text-white mb-3">Meus resgates</h2>
                <div className="space-y-2">
                  {mine.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs">
                      <div>
                        <p className="font-medium text-white">{r.freebies?.name || "—"}</p>
                        <p className="text-white/40">{new Date(r.created_at).toLocaleString("pt-BR")}</p>
                      </div>
                      {r.status === "delivered"
                        ? <span className="flex items-center gap-1 text-green-400"><CheckCircle2 className="h-3.5 w-3.5" /> Entregue</span>
                        : <span className="flex items-center gap-1 text-yellow-400"><Clock className="h-3.5 w-3.5" /> Pendente</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
