import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, ClipboardCheck, ImageIcon } from "lucide-react";

interface PendingProduct {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  coach_commission_percentage: number;
  professional_net_amount: number | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  coach: {
    id: string;
    specialty_key: string | null;
    profile: { name: string | null } | null;
  } | null;
}

const SPECIALTY_LABEL: Record<string, string> = {
  personal_trainer: "Personal Trainer",
  nutritionist: "Nutricionista",
  doctor: "Médico(a)",
  cardiologist: "Cardiologista",
  esthetician: "Esteticista",
  lawyer: "Advogado(a)",
  other: "Outro",
};

export function ProfessionalProductsApprovalTab({ coachId }: { coachId: string }) {
  const [items, setItems] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("professional_products" as never)
      .select(
        "id,name,description,image_url,price,coach_commission_percentage,professional_net_amount,status,admin_notes,created_at,coach:coaches!professional_products_coach_id_fkey(id,specialty_key,upline_coach_id,profile:profiles!coaches_profile_id_fkey(name))" as never,
      )
      .order("created_at" as never, { ascending: false });
    if (error) toast.error(error.message);
    const rows = ((data as unknown as any[]) || []).filter(
      (r) => r.coach?.upline_coach_id === coachId,
    );
    setItems(rows as PendingProduct[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [coachId]);

  const approve = async (id: string) => {
    setActingId(id);
    const { error } = await supabase
      .from("professional_products" as never)
      .update({ status: "approved", admin_notes: null } as never)
      .eq("id" as never, id);
    setActingId(null);
    if (error) return toast.error(error.message);
    toast.success("Produto aprovado e disponível na loja");
    load();
  };

  const reject = async (id: string) => {
    if (!reason.trim()) return toast.error("Informe o motivo da rejeição");
    setActingId(id);
    const { error } = await supabase
      .from("professional_products" as never)
      .update({ status: "rejected", admin_notes: reason } as never)
      .eq("id" as never, id);
    setActingId(null);
    if (error) return toast.error(error.message);
    toast.success("Produto rejeitado");
    setReasonFor(null);
    setReason("");
    load();
  };

  const pending = items.filter((i) => i.status === "pending");
  const handled = items.filter((i) => i.status !== "pending");

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">
      <header>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Aprovação de produtos de parceiros
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Produtos criados pelos profissionais da sua rede. Aprovados aparecem na loja como
          “Produtos de Parceiros”.
        </p>
      </header>

      {pending.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-sm text-white/50">Nenhum produto aguardando aprovação.</p>
        </div>
      )}

      <div className="space-y-2">
        {pending.map((p) => (
          <Card key={p.id} p={p} acting={actingId === p.id}
            onApprove={() => approve(p.id)}
            onReject={() => { setReasonFor(p.id); setReason(""); }}
          />
        ))}
      </div>

      {handled.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-2">Histórico</h3>
          <div className="space-y-2">
            {handled.map((p) => <Card key={p.id} p={p} readOnly />)}
          </div>
        </section>
      )}

      {reasonFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={() => setReasonFor(null)}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-3">Motivo da rejeição</h3>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
              className="w-full rounded bg-black/40 border border-white/10 px-3 py-2 text-sm"
              placeholder="Explique para o profissional o que precisa ser ajustado" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setReasonFor(null)} className="flex-1 rounded bg-white/5 px-3 py-2 text-sm">Cancelar</button>
              <button onClick={() => reject(reasonFor)} className="flex-1 rounded bg-red-500 px-3 py-2 text-sm font-bold">Rejeitar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ p, acting, onApprove, onReject, readOnly }: {
  p: PendingProduct; acting?: boolean; onApprove?: () => void; onReject?: () => void; readOnly?: boolean;
}) {
  const spec = p.coach?.specialty_key ? SPECIALTY_LABEL[p.coach.specialty_key] || p.coach.specialty_key : "Profissional";
  const author = p.coach?.profile?.name || "—";
  return (
    <div className="rounded-xl p-3 flex gap-3" style={{ backgroundColor: "#1A1A1A" }}>
      {p.image_url ? (
        <img src={p.image_url} alt={p.name} className="h-20 w-20 rounded object-cover" />
      ) : (
        <div className="h-20 w-20 rounded bg-white/5 flex items-center justify-center">
          <ImageIcon className="h-6 w-6 text-white/30" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold truncate">{p.name}</p>
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${
            p.status === "approved" ? "bg-green-500/15 text-green-400"
              : p.status === "rejected" ? "bg-red-500/15 text-red-400"
              : "bg-yellow-500/15 text-yellow-400"
          }`}>{p.status}</span>
        </div>
        <div className="text-[11px] text-white/50 mt-0.5">
          {author} • {spec}
        </div>
        <div className="text-[11px] text-white/70 mt-1">
          Preço: <span className="text-primary font-semibold">R$ {Number(p.price).toFixed(2)}</span>
          {" · "}Comissão coach: <span className="text-primary font-semibold">{p.coach_commission_percentage}%</span>
        </div>
        {p.description && <p className="text-[11px] text-white/50 mt-1 line-clamp-2">{p.description}</p>}
        {p.admin_notes && p.status === "rejected" && (
          <p className="text-[10px] text-red-300 mt-1">Obs.: {p.admin_notes}</p>
        )}
        {!readOnly && (
          <div className="mt-2 flex gap-2">
            <button onClick={onApprove} disabled={acting}
              className="flex items-center gap-1 rounded bg-green-500 px-3 py-1.5 text-[11px] font-bold disabled:opacity-50">
              <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
            </button>
            <button onClick={onReject} disabled={acting}
              className="flex items-center gap-1 rounded bg-red-500/80 px-3 py-1.5 text-[11px] font-bold disabled:opacity-50">
              <XCircle className="h-3.5 w-3.5" /> Rejeitar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
