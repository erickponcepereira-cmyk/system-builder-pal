import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, GraduationCap, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/coach-applications")({ component: CoachApplicationsPage });

type ApplicationRow = {
  id: string;
  motivation: string;
  experience: string | null;
  city: string | null;
  phone: string | null;
  status: string;
  completed_modules: number | null;
  total_modules: number | null;
  admin_notes: string | null;
  created_at: string | null;
  profiles: { name: string; email: string } | null;
};

function CoachApplicationsPage() {
  const [items, setItems] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("coach_applications" as never)
      .select("id,motivation,experience,city,phone,status,completed_modules,total_modules,admin_notes,created_at,profiles!coach_applications_profile_id_fkey(name,email)" as never)
      .order("created_at" as never, { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as unknown as ApplicationRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const review = async (id: string, status: "approved" | "rejected") => {
    setActing(id);
    const { error } = await supabase.rpc("review_coach_application" as never, { _application_id: id, _status: status, _admin_notes: notes[id] || null } as never);
    if (error) toast.error(error.message);
    else { toast.success(status === "approved" ? "Solicitação aprovada" : "Solicitação recusada"); await load(); }
    setActing(null);
  };

  const pending = items.filter((item) => item.status === "submitted").length;

  return <>
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h1 className="text-2xl font-bold text-white">Solicitações para Coach</h1><p className="text-sm text-white/50">Aprove alunos que concluíram a formação oficial</p></div><Button onClick={load} variant="outline" className="gap-2 border-white/10 text-white/70"><RefreshCw className="h-4 w-4" /> Atualizar</Button></div>
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><Metric label="Pendentes" value={String(pending)} /><Metric label="Total" value={String(items.length)} /><Metric label="Aprovadas" value={String(items.filter((item) => item.status === "approved").length)} /></div>
    {loading ? <div className="rounded-2xl p-10 text-center text-white/50" style={{ backgroundColor: "#1A1A1A" }}><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />Carregando solicitações...</div> : items.length === 0 ? <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: "#1A1A1A" }}><GraduationCap className="mx-auto mb-3 h-10 w-10 text-white/20" /><p className="text-white/50">Nenhuma solicitação recebida.</p></div> : <div className="space-y-4">{items.map((item) => <article key={item.id} className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-white">{item.profiles?.name || "Aluno"}</h2><span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{item.status}</span></div><p className="mt-1 text-xs text-white/45">{item.profiles?.email || "—"} · {item.city || "cidade não informada"} · {item.phone || "sem telefone"}</p><p className="mt-2 text-xs text-white/60">Módulos: {item.completed_modules || 0}/{item.total_modules || 0}</p></div><p className="text-xs text-white/35">{item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : "—"}</p></div><div className="mt-4 grid gap-3 lg:grid-cols-2"><div className="rounded-xl bg-white/5 p-3"><p className="mb-1 text-[10px] font-bold uppercase text-white/35">Motivação</p><p className="text-xs leading-relaxed text-white/65">{item.motivation}</p></div><div className="rounded-xl bg-white/5 p-3"><p className="mb-1 text-[10px] font-bold uppercase text-white/35">Experiência</p><p className="text-xs leading-relaxed text-white/65">{item.experience || "Não informada"}</p></div></div>{item.status === "submitted" ? <div className="mt-4 space-y-3"><textarea value={notes[item.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Observação interna ou motivo da recusa" rows={2} className="field-control" /><div className="flex flex-wrap gap-2"><Button onClick={() => review(item.id, "approved")} disabled={acting === item.id} className="gap-1.5"><Check className="h-4 w-4" /> Aprovar</Button><Button onClick={() => review(item.id, "rejected")} disabled={acting === item.id} variant="destructive" className="gap-1.5"><X className="h-4 w-4" /> Recusar</Button></div></div> : item.admin_notes && <p className="mt-3 rounded-xl bg-white/5 p-3 text-xs text-white/55">{item.admin_notes}</p>}</article>)}</div>}
  </>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}><p className="text-2xl font-bold text-white">{value}</p><p className="text-xs text-white/40">{label}</p></div>; }
