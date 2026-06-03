import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Stethoscope, Loader2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProductReviewModal } from "@/components/admin/ProductReviewModal";

export const Route = createFileRoute("/admin/professional-products")({
  head: () => ({ meta: [{ title: "Produtos de Profissionais — Admin" }] }),
  component: AdminProfessionalProducts,
});

interface Row {
  id: string;
  name: string;
  status: string;
  price: number;
  image_url: string | null;
  coach_id: string;
  coaches?: { profile?: { name: string | null } | null } | null;
}

function AdminProfessionalProducts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("professional_products" as never)
      .select("id,name,status,price,image_url,coach_id,coaches(profile:profiles(name))" as never)
      .order("created_at" as never, { ascending: false });
    if (error) console.error("[admin pro products]", error);
    setRows((data as unknown as Row[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const pending = rows.filter((r) => r.status === "pending");
  const history = rows.filter((r) => r.status !== "pending");

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-primary" /> Produtos de Profissionais
        </h1>
        <p className="text-sm text-white/50">Aprovação de produtos cadastrados por profissionais</p>
      </div>

      <div className="flex gap-2 border-b border-white/10 mb-4">
        <button onClick={() => setTab("pending")} className={`px-4 py-2 text-sm border-b-2 ${tab === "pending" ? "border-primary text-primary" : "border-transparent text-white/60"}`}>
          Pendentes ({pending.length})
        </button>
        <button onClick={() => setTab("history")} className={`px-4 py-2 text-sm border-b-2 ${tab === "history" ? "border-primary text-primary" : "border-transparent text-white/60"}`}>
          Histórico
        </button>
      </div>

      {loading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />}

      {!loading && tab === "pending" && (
        <div className="space-y-2">
          {pending.map((p) => (
            <button key={p.id} onClick={() => setOpenId(p.id)} className="w-full text-left rounded-xl p-4 flex gap-3 hover:ring-1 hover:ring-primary/40" style={{ backgroundColor: "#1A1A1A" }}>
              {p.image_url ? <img src={p.image_url} className="h-20 w-20 rounded object-cover" /> : <div className="h-20 w-20 rounded bg-white/5" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{p.name}</p>
                <p className="text-[11px] text-white/50">{p.coaches?.profile?.name || "Profissional"} · R$ {Number(p.price).toFixed(2)}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary"><Eye className="h-3.5 w-3.5" /> Abrir para revisar</span>
              </div>
            </button>
          ))}
          {pending.length === 0 && <p className="text-sm text-white/50">Nenhum produto pendente.</p>}
        </div>
      )}

      {!loading && tab === "history" && (
        <div className="space-y-1">
          {history.slice(0, 50).map((p) => (
            <button key={p.id} onClick={() => setOpenId(p.id)} className="w-full flex items-center justify-between rounded bg-white/5 px-3 py-2 text-xs hover:bg-white/10">
              <span className="text-white truncate">{p.coaches?.profile?.name || "—"} · {p.name}</span>
              <span className={p.status === "approved" ? "text-green-400" : p.status === "rejected" ? "text-red-400" : "text-white/50"}>{p.status}</span>
            </button>
          ))}
          {history.length === 0 && <p className="text-sm text-white/50">Sem histórico.</p>}
        </div>
      )}

      {openId && (
        <ProductReviewModal
          table="professional_products"
          productId={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </>
  );
}
