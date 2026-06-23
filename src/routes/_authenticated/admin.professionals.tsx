import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Stethoscope, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/professionals")({
  head: () => ({ meta: [{ title: "Profissionais — Admin" }] }),
  component: AdminProfessionals,
});

type Pro = {
  id: string;
  profile_id: string;
  specialty_key: string | null;
  specialty_custom_description: string | null;
  professional_council: string | null;
  council_number: string | null;
  approved_at: string | null;
  specialty_pending_setup: boolean;
  serves_whole_network: boolean;
  profiles: { name: string; email: string; phone: string | null; avatar_url: string | null; status: string | null } | null;
};

type Specialty = { key: string; label: string; requires_admin_setup: boolean; default_tabs: unknown };

function AdminProfessionals() {
  const [loading, setLoading] = useState(true);
  const [pros, setPros] = useState<Pro[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");

  const load = async () => {
    setLoading(true);
    const [{ data: list }, { data: specs }] = await Promise.all([
      supabase
        .from("coaches")
        .select("id,profile_id,specialty_key,specialty_custom_description,professional_council,council_number,approved_at,specialty_pending_setup,serves_whole_network,profiles!coaches_profile_id_fkey(name,email,phone,avatar_url,status)")
        .eq("is_professional", true)
        .order("created_at", { ascending: false }),
      supabase.from("professional_specialties").select("key,label,requires_admin_setup,default_tabs").order("sort_order"),
    ]);
    setPros((list as unknown as Pro[]) || []);
    setSpecialties((specs as Specialty[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const approve = async (pro: Pro) => {
    const { error } = await supabase
      .from("coaches")
      .update({ approved_at: new Date().toISOString(), onboarding_stage: "released" })
      .eq("id", pro.id);
    if (error) { toast.error(error.message); return; }
    if (pro.profile_id) {
      await supabase.from("profiles").update({ status: "active" }).eq("id", pro.profile_id);
    }
    toast.success("Profissional aprovado.");
    load();
  };

  const setSpecialty = async (pro: Pro, key: string) => {
    const spec = specialties.find((s) => s.key === key);
    const { error } = await supabase
      .from("coaches")
      .update({ specialty_key: key, specialty_pending_setup: spec?.requires_admin_setup || false })
      .eq("id", pro.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Especialidade atualizada.");
    load();
  };

  const filtered = pros.filter((p) => {
    if (filter === "pending") return !p.approved_at;
    if (filter === "approved") return !!p.approved_at;
    return true;
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Stethoscope className="h-6 w-6 text-primary" /> Profissionais da Saúde</h1>
          <p className="text-sm text-white/50">Aprovação, especialidade e configuração de painel.</p>
        </div>
        <div className="flex gap-2">
          {(["all", "pending", "approved"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${filter === f ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
              {f === "all" ? "Todos" : f === "pending" ? "Pendentes" : "Aprovados"} ({pros.filter((p) => f === "all" ? true : f === "pending" ? !p.approved_at : !!p.approved_at).length})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-sm text-white/50">Nenhum profissional encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const spec = specialties.find((s) => s.key === p.specialty_key);
            return (
              <div key={p.id} className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center text-white font-bold">
                    {(p.profiles?.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <p className="font-bold text-white">{p.profiles?.name || "—"}</p>
                    <p className="text-xs text-white/40">{p.profiles?.email} · {p.profiles?.phone || "sem telefone"}</p>
                    <p className="text-[11px] text-white/40 mt-1">
                      {p.professional_council ? `${p.professional_council} ${p.council_number || ""}` : "Sem conselho informado"}
                    </p>
                    {p.specialty_custom_description && (
                      <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-amber-400/80 font-semibold">Área informada pelo profissional</p>
                        <p className="text-xs text-amber-200 mt-0.5">{p.specialty_custom_description}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 min-w-[200px]">
                    <Select value={p.specialty_key || ""} onValueChange={(v) => setSpecialty(p, v)}>
                      <SelectTrigger className="h-9 bg-white/5 border-white/10 text-white text-xs">
                        <SelectValue placeholder="Definir especialidade" />
                      </SelectTrigger>
                      <SelectContent>
                        {specialties.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {spec?.requires_admin_setup && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                        <Settings2 className="h-3 w-3" /> Precisa configuração customizada
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {p.approved_at ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Aprovado
                      </span>
                    ) : (
                      <Button size="sm" onClick={() => approve(p)} disabled={!p.specialty_key}>Aprovar</Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
