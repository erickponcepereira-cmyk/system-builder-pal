import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Check, X, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/partners")({
  head: () => ({ meta: [{ title: "Empresas Parceiras — Admin" }] }),
  component: AdminPartners,
});

interface PartnerRow { id: string; fantasy_name: string; document: string | null; whatsapp: string | null; city: string | null; state: string | null; status: string; photo_url: string | null; description: string | null; }
interface ProductRow { id: string; partner_id: string; name: string; kind: string; status: string; price: number; image_url: string | null; admin_notes: string | null; partners?: { fantasy_name: string } | null; }

function AdminPartners() {
  const [tab, setTab] = useState<"empresas" | "produtos">("empresas");
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const [a, b] = await Promise.all([
      supabase.from("partners" as never).select("*").order("created_at" as never, { ascending: false }),
      supabase.from("partner_products" as never).select("*, partners(fantasy_name)").order("created_at" as never, { ascending: false }),
    ]);
    setPartners((a.data as unknown as PartnerRow[]) || []);
    setProducts((b.data as unknown as ProductRow[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updatePartner = async (id: string, patch: Partial<PartnerRow>) => {
    const { error } = await supabase.from("partners" as never).update(patch as never).eq("id" as never, id);
    if (error) return toast.error(error.message);
    toast.success("Atualizado"); load();
  };

  const reviewProduct = async (id: string, decision: "approved" | "rejected") => {
    const patch: Partial<ProductRow> & { approved_at?: string | null } = { status: decision, admin_notes: notes[id] || null };
    if (decision === "approved") patch.approved_at = new Date().toISOString();
    const { error } = await supabase.from("partner_products" as never).update(patch as never).eq("id" as never, id);
    if (error) return toast.error(error.message);
    toast.success(decision === "approved" ? "Produto aprovado" : "Produto reprovado"); load();
  };

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Building2 className="h-6 w-6 text-primary" /> Empresas Parceiras</h1>
        <p className="text-sm text-white/50">Aprovação e gestão de empresas e produtos patrocinados</p>
      </div>

      <div className="flex gap-2 border-b border-white/10 mb-4">
        <button onClick={() => setTab("empresas")} className={`px-4 py-2 text-sm border-b-2 ${tab === "empresas" ? "border-primary text-primary" : "border-transparent text-white/60"}`}>Empresas ({partners.length})</button>
        <button onClick={() => setTab("produtos")} className={`px-4 py-2 text-sm border-b-2 ${tab === "produtos" ? "border-primary text-primary" : "border-transparent text-white/60"}`}>Produtos pendentes ({products.filter(p => p.status === "pending").length})</button>
      </div>

      {loading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />}

      {!loading && tab === "empresas" && (
        <div className="grid gap-2 lg:grid-cols-2">
          {partners.map(p => (
            <div key={p.id} className="rounded-xl p-4 flex gap-3" style={{ backgroundColor: "#1A1A1A" }}>
              {p.photo_url ? <img src={p.photo_url} className="h-14 w-14 rounded-full object-cover" /> : <div className="h-14 w-14 rounded-full bg-white/5" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{p.fantasy_name}</p>
                <p className="text-[11px] text-white/50">{p.document || "—"} · {p.city}/{p.state}</p>
                <p className="text-[11px] text-white/40 mt-1">WhatsApp: {p.whatsapp || "—"}</p>
                <span className={`mt-2 inline-block text-[10px] px-2 py-0.5 rounded ${p.status === "approved" ? "bg-green-500/15 text-green-400" : p.status === "blocked" ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-400"}`}>{p.status}</span>
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  {p.status !== "approved" && <button onClick={() => updatePartner(p.id, { status: "approved" })} className="text-[11px] rounded bg-green-500/15 text-green-400 px-2 py-1">Aprovar</button>}
                  {p.status !== "blocked" && <button onClick={() => updatePartner(p.id, { status: "blocked" })} className="text-[11px] rounded bg-red-500/15 text-red-400 px-2 py-1">Bloquear</button>}
                  {p.status === "blocked" && <button onClick={() => updatePartner(p.id, { status: "approved" })} className="text-[11px] rounded bg-white/10 text-white px-2 py-1">Reativar</button>}
                </div>
              </div>
            </div>
          ))}
          {partners.length === 0 && <p className="text-sm text-white/50">Nenhuma empresa cadastrada.</p>}
        </div>
      )}

      {!loading && tab === "produtos" && (
        <div className="space-y-2">
          {products.filter(p => p.status === "pending").map(p => (
            <div key={p.id} className="rounded-xl p-4 flex gap-3" style={{ backgroundColor: "#1A1A1A" }}>
              {p.image_url ? <img src={p.image_url} className="h-20 w-20 rounded object-cover" /> : <div className="h-20 w-20 rounded bg-white/5" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{p.name}</p>
                <p className="text-[11px] text-white/50">{p.partners?.fantasy_name} · {p.kind === "free" ? "Gratuito" : `R$ ${Number(p.price).toFixed(2)}`}</p>
                <textarea value={notes[p.id] || ""} onChange={e => setNotes({ ...notes, [p.id]: e.target.value })} placeholder="Observação (obrigatória para reprovar)" className="mt-2 w-full rounded bg-black/40 border border-white/10 px-2 py-1.5 text-xs text-white" rows={2} />
                <div className="mt-2 flex gap-2">
                  <button onClick={() => reviewProduct(p.id, "approved")} className="flex items-center gap-1 rounded bg-green-500/15 text-green-400 px-3 py-1.5 text-xs"><Check className="h-3.5 w-3.5" /> Aprovar</button>
                  <button onClick={() => { if (!notes[p.id]?.trim()) return toast.error("Informe a observação"); reviewProduct(p.id, "rejected"); }} className="flex items-center gap-1 rounded bg-red-500/15 text-red-400 px-3 py-1.5 text-xs"><X className="h-3.5 w-3.5" /> Reprovar</button>
                </div>
              </div>
            </div>
          ))}
          {products.filter(p => p.status === "pending").length === 0 && <p className="text-sm text-white/50">Nenhum produto pendente.</p>}

          <h3 className="mt-6 text-sm font-bold text-white">Histórico</h3>
          <div className="space-y-1">
            {products.filter(p => p.status !== "pending").slice(0, 30).map(p => (
              <div key={p.id} className="flex items-center justify-between rounded bg-white/5 px-3 py-2 text-xs">
                <span className="text-white truncate">{p.partners?.fantasy_name} · {p.name}</span>
                <span className={p.status === "approved" ? "text-green-400" : p.status === "rejected" ? "text-red-400" : "text-white/50"}>{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
