import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, X, Mail, Phone, MapPin, CreditCard, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/coaches")({
  component: AdminCoaches,
});

interface CoachRow {
  id: string;
  referral_code: string;
  approved_at: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  total_active_students: number | null;
  total_sales: number | null;
  created_at: string | null;
  profiles: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    city: string | null;
    state: string | null;
    cpf: string | null;
  } | null;
}

function AdminCoaches() {
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("coaches")
      .select("*, profiles!coaches_profile_id_fkey(id,name,email,phone,city,state,cpf)")
      .order("created_at", { ascending: false });
    setCoaches((data as unknown as CoachRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const approve = async (coachId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: adminProfile } = await supabase
      .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
    const { error } = await supabase
      .from("coaches")
      .update({ approved_at: new Date().toISOString(), approved_by: adminProfile?.id })
      .eq("id", coachId);
    if (error) toast.error("Erro ao aprovar");
    else { toast.success("Coach aprovado!"); load(); }
  };

  const reject = async (coachId: string) => {
    if (!confirm("Rejeitar este coach? O cadastro será removido.")) return;
    const { error } = await supabase.from("coaches").delete().eq("id", coachId);
    if (error) toast.error("Erro ao rejeitar");
    else { toast.success("Cadastro rejeitado"); load(); }
  };

  const filtered = coaches.filter((c) => {
    if (filter === "pending" && c.approved_at) return false;
    if (filter === "approved" && !c.approved_at) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.profiles?.name.toLowerCase().includes(q) ||
             c.profiles?.email.toLowerCase().includes(q) ||
             c.referral_code.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    pending: coaches.filter((c) => !c.approved_at).length,
    approved: coaches.filter((c) => c.approved_at).length,
    all: coaches.length,
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Coaches</h1>
        <p className="text-sm text-white/50">Aprovar, gerenciar e visualizar coaches da rede</p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "#1A1A1A" }}>
          {(["pending", "approved", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"
              }`}
            >
              {f === "pending" ? "Pendentes" : f === "approved" ? "Aprovados" : "Todos"} ({counts[f]})
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl pl-10 pr-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
            style={{ backgroundColor: "#1A1A1A" }}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-white/50">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-white/50">Nenhum coach encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <div key={c.id} className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-base font-bold text-white">{c.profiles?.name}</h3>
                    {c.approved_at ? (
                      <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-bold text-success">
                        Aprovado
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                        Pendente
                      </span>
                    )}
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-mono text-primary">
                      {c.referral_code}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/60">
                    <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {c.profiles?.email}</div>
                    {c.profiles?.phone && (
                      <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {c.profiles.phone}</div>
                    )}
                    {c.profiles?.city && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" /> {c.profiles.city}/{c.profiles.state}
                      </div>
                    )}
                    {c.pix_key && (
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="h-3 w-3" /> PIX ({c.pix_key_type}): {c.pix_key}
                      </div>
                    )}
                  </div>
                  {c.approved_at && (
                    <div className="mt-3 flex gap-4 text-xs">
                      <span className="text-white/50">Alunos: <span className="font-bold text-white">{c.total_active_students || 0}</span></span>
                      <span className="text-white/50">Vendas: <span className="font-bold text-white">R$ {Number(c.total_sales || 0).toLocaleString("pt-BR")}</span></span>
                    </div>
                  )}
                </div>

                {!c.approved_at && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(c.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                    >
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </button>
                    <button
                      onClick={() => reject(c.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                    >
                      <X className="h-3.5 w-3.5" /> Rejeitar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
