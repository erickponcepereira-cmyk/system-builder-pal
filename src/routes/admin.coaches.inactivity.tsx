import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Clock, Loader2, RefreshCw, Search, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/coaches/inactivity")({
  component: CoachInactivityPage,
});

type CoachProfile = { id: string; name: string; email: string; city: string | null; status: string | null };
type CoachRow = {
  id: string;
  profile_id: string;
  upline_coach_id: string | null;
  total_active_students: number | null;
  total_sales: number | null;
  created_at: string | null;
  last_activity_at: string | null;
  inactive_since: string | null;
  inactivity_grace_until: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  transferred_to_coach_id: string | null;
  profiles: CoachProfile | null;
};
type TransferRow = {
  id: string;
  from_coach_id: string;
  to_coach_id: string;
  reason: string | null;
  students_transferred: number | null;
  coaches_transferred: number | null;
  transferred_at: string | null;
};

const DAY = 1000 * 60 * 60 * 24;

function CoachInactivityPage() {
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [query, setQuery] = useState("");
  const [targetByCoach, setTargetByCoach] = useState<Record<string, string>>( {} );
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    await supabase.rpc("refresh_coach_inactivity" as never, {} as never);
    const [{ data: coachData, error }, { data: transferData }] = await Promise.all([
      supabase
        .from("coaches")
        .select("id,profile_id,upline_coach_id,total_active_students,total_sales,created_at,last_activity_at,inactive_since,inactivity_grace_until,blocked_at,blocked_reason,transferred_to_coach_id,profiles!coaches_profile_id_fkey(id,name,email,city,status)")
        .order("last_activity_at", { ascending: true, nullsFirst: true }),
      supabase
        .from("coach_transfers")
        .select("id,from_coach_id,to_coach_id,reason,students_transferred,coaches_transferred,transferred_at")
        .order("transferred_at", { ascending: false })
        .limit(8),
    ]);
    if (error) toast.error(error.message);
    setCoaches((coachData as unknown as CoachRow[]) || []);
    setTransfers((transferData as unknown as TransferRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const enriched = useMemo(() => {
    const today = new Date();
    const lower = query.trim().toLowerCase();
    return coaches
      .map((coach) => {
        const last = new Date(coach.last_activity_at || coach.created_at || Date.now());
        const days = Math.max(0, Math.floor((today.getTime() - last.getTime()) / DAY));
        const graceActive = coach.inactivity_grace_until ? new Date(coach.inactivity_grace_until) >= today : false;
        const status = coach.blocked_at || coach.profiles?.status === "blocked" ? "blocked" : graceActive ? "extended" : days >= 60 ? "critical" : days >= 30 ? "attention" : "active";
        return { ...coach, days, status, graceActive };
      })
      .filter((coach) => coach.status !== "active")
      .filter((coach) => !lower || coach.profiles?.name.toLowerCase().includes(lower) || coach.profiles?.email.toLowerCase().includes(lower));
  }, [coaches, query]);

  const availableTargets = coaches.filter((coach) => !coach.blocked_at && coach.profiles?.status !== "blocked");
  const counts = {
    attention: enriched.filter((coach) => coach.status === "attention" || coach.status === "extended").length,
    critical: enriched.filter((coach) => coach.status === "critical").length,
    blocked: enriched.filter((coach) => coach.status === "blocked").length,
  };

  const runAction = async (coachId: string, action: "extend" | "block" | "transfer") => {
    setActingId(`${action}-${coachId}`);
    const targetId = targetByCoach[coachId];
    const rpc = action === "extend" ? "extend_coach_inactivity_grace" : action === "block" ? "block_inactive_coach" : "transfer_inactive_coach_network";
    const params = action === "extend"
      ? { _coach_id: coachId, _days: 30, _reason: "Prazo administrativo estendido por mais 30 dias." }
      : action === "block"
        ? { _coach_id: coachId, _reason: "Bloqueado manualmente por inatividade." }
        : { _from_coach_id: coachId, _to_coach_id: targetId, _reason: "Remanejamento administrativo por inatividade." };

    if (action === "transfer" && !targetId) {
      toast.error("Selecione o coach destino.");
      setActingId(null);
      return;
    }

    const { error } = await supabase.rpc(rpc as never, params as never);
    if (error) toast.error(error.message);
    else {
      toast.success(action === "extend" ? "Prazo estendido." : action === "block" ? "Coach bloqueado." : "Rede transferida.");
      await load();
    }
    setActingId(null);
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Inatividade</h1>
          <p className="text-sm text-white/50">Verificação automática, bloqueio e remanejamento real de redes</p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline" className="border-white/10 text-white/70">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Recalcular agora
        </Button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Em atenção", value: counts.attention, icon: Clock, color: "text-red-400" },
          { label: "Críticos", value: counts.critical, icon: AlertTriangle, color: "text-red-400" },
          { label: "Bloqueados", value: counts.blocked, icon: Ban, color: "text-red-400" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/50">{card.label}</p>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="mt-2 text-3xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 flex items-center gap-2 rounded-2xl border border-white/5 px-4 py-3" style={{ backgroundColor: "#1A1A1A" }}>
        <Search className="h-4 w-4 text-white/30" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar coach em risco..." className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35" />
      </div>

      {loading ? (
        <div className="rounded-2xl p-10 text-center text-white/50" style={{ backgroundColor: "#1A1A1A" }}><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />Carregando coaches...</div>
      ) : enriched.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
          <p className="font-bold text-white">Nenhum coach em risco agora</p>
          <p className="mt-1 text-sm text-white/45">A rotina automática continua monitorando a cada dia.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {enriched.map((coach) => {
            const statusClass = coach.status === "blocked" ? "bg-red-500/15 text-red-300" : coach.status === "critical" ? "bg-red-500/15 text-red-300" : coach.status === "extended" ? "bg-blue-500/15 text-blue-300" : "bg-yellow-500/15 text-yellow-300";
            return (
              <article key={coach.id} className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">{coach.profiles?.name?.charAt(0) || "C"}</div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold text-white">{coach.profiles?.name || "Coach"}</h2>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass}`}>
                          {coach.status === "blocked" ? "bloqueado" : coach.status === "extended" ? `prazo até ${new Date(coach.inactivity_grace_until || "").toLocaleDateString("pt-BR")}` : `${coach.days} dias inativo`}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-white/50">{coach.profiles?.email} · {coach.profiles?.city || "cidade não informada"}</p>
                      <p className="text-xs text-white/40">{coach.total_active_students || 0} alunos diretos · R$ {Number(coach.total_sales || 0).toFixed(2).replace(".", ",")} em vendas</p>
                      {coach.blocked_reason && <p className="mt-1 text-xs text-red-300/80">{coach.blocked_reason}</p>}
                    </div>
                  </div>

                  <div className="w-full lg:max-w-md">
                    <label className="text-xs text-white/50">Transferir equipe para</label>
                    <select
                      value={targetByCoach[coach.id] || ""}
                      onChange={(event) => setTargetByCoach((current) => ({ ...current, [coach.id]: event.target.value }))}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="">Selecionar coach ativo</option>
                      {availableTargets.filter((target) => target.id !== coach.id).map((target) => <option key={target.id} value={target.id}>{target.profiles?.name || "Coach"}</option>)}
                    </select>
                    <p className="mt-2 text-[11px] text-primary">A transferência move alunos diretos e downlines imediatos.</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-4">
                  <Button size="sm" variant="outline" disabled={actingId === `transfer-${coach.id}`} onClick={() => runAction(coach.id, "transfer")} className="border-white/10 text-white/70">
                    {actingId === `transfer-${coach.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />} Transferir rede
                  </Button>
                  <Button size="sm" variant="outline" disabled={actingId === `extend-${coach.id}`} onClick={() => runAction(coach.id, "extend")} className="border-white/10 text-white/70">Dar mais 30 dias</Button>
                  <Button size="sm" variant="destructive" disabled={actingId === `block-${coach.id}`} onClick={() => runAction(coach.id, "block")}>Bloquear agora</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {transfers.length > 0 && (
        <section className="mt-6 rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-center gap-2 text-white"><Users className="h-4 w-4 text-primary" /><h2 className="font-bold">Últimos remanejamentos</h2></div>
          <div className="grid gap-2">
            {transfers.map((transfer) => (
              <div key={transfer.id} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white/55">
                {transfer.students_transferred || 0} alunos e {transfer.coaches_transferred || 0} coaches transferidos · {transfer.transferred_at ? new Date(transfer.transferred_at).toLocaleString("pt-BR") : "—"}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
