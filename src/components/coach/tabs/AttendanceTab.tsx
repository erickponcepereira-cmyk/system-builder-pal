import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, TrendingDown, TrendingUp, Minus, Search, Activity, ShoppingBag, LogIn, CalendarCheck } from "lucide-react";
import { getCoachAttendance, type CoachStudentAttendance } from "@/lib/coach-attendance.functions";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import StudentDetailsModal from "@/components/coach/StudentDetailsModal";

type Filter = "all" | "active" | "watch" | "inactive_7" | "inactive_15" | "inactive_30";
type SortKey = "most_active" | "most_inactive" | "name";

const STATUS_LABEL: Record<CoachStudentAttendance["status"], string> = {
  active: "Ativo",
  watch: "Em queda",
  inactive_7: "Inativo 7d+",
  inactive_15: "Inativo 15d+",
  inactive_30: "Inativo 30d+",
};
const STATUS_COLOR: Record<CoachStudentAttendance["status"], string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  watch: "bg-amber-500/15 text-amber-400",
  inactive_7: "bg-orange-500/15 text-orange-400",
  inactive_15: "bg-rose-500/15 text-rose-400",
  inactive_30: "bg-red-600/20 text-red-400",
};

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("pt-BR");
}
function fmtRelative(value: string | null): string {
  if (!value) return "nunca";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days}d`;
  if (days < 365) return `há ${Math.floor(days / 30)}m`;
  return `há ${Math.floor(days / 365)}a`;
}

export function AttendanceTab() {
  const fetchAttendance = useServerFn(getCoachAttendance);
  const [rows, setRows] = useState<CoachStudentAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("most_inactive");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAttendance();
        setRows(data);
      } catch (err) {
        console.error("[AttendanceTab] failed to load", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchAttendance]);

  const counts = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        if (r.trend === "dropping" && r.status !== "inactive_30") acc.dropping += 1;
        return acc;
      },
      { active: 0, watch: 0, inactive_7: 0, inactive_15: 0, inactive_30: 0, dropping: 0 } as Record<string, number>
    );
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (q && !`${r.name} ${r.email} ${r.phone || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const aDays = a.days_since_activity ?? 99999;
      const bDays = b.days_since_activity ?? 99999;
      return sort === "most_active" ? aDays - bDays : bDays - aDays;
    });
    return list;
  }, [rows, filter, sort, search]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Frequência dos Alunos</h1>
        <p className="text-sm text-white/50">Acompanhe acessos, check-ins, compras e identifique alunos em risco</p>
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <SummaryCard label="Ativos" value={counts.active} tone="emerald" />
        <SummaryCard label="Em queda" value={counts.watch} tone="amber" />
        <SummaryCard label="Inativos 7d+" value={counts.inactive_7} tone="orange" />
        <SummaryCard label="Inativos 15d+" value={counts.inactive_15} tone="rose" />
        <SummaryCard label="Inativos 30d+" value={counts.inactive_30} tone="red" />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar aluno..."
            className="w-full rounded-xl bg-white/5 pl-9 pr-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-white/5 p-1">
          {(["all", "active", "watch", "inactive_7", "inactive_15", "inactive_30"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${filter === f ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}
            >
              {f === "all" ? "Todos" : STATUS_LABEL[f as CoachStudentAttendance["status"]]}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-xl bg-white/5 px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="most_inactive">Mais inativos primeiro</option>
          <option value="most_active">Mais ativos primeiro</option>
          <option value="name">Ordem alfabética</option>
        </select>
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? (
          <p className="text-sm text-white/50">Carregando frequência...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-white/50">Nenhum aluno encontrado.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => setOpenId(r.id)}
                onKeyDown={(e) => { if (e.key === "Enter") setOpenId(r.id); }}
                className="rounded-xl p-3 cursor-pointer hover:bg-white/[0.03] transition-colors"
                style={{ backgroundColor: "#0F0F0F" }}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-white">{r.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                      {r.trend === "dropping" && r.status !== "inactive_30" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                          <AlertTriangle className="h-3 w-3" /> Frequência caindo
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-white/40">{r.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white">
                      {r.trend === "rising" ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : r.trend === "dropping" ? <TrendingDown className="h-3 w-3 text-rose-400" /> : <Minus className="h-3 w-3 text-white/40" />}
                      {r.checkins_7d}/sem
                    </span>
                    <WhatsAppButton
                      phone={r.phone}
                      size="icon"
                      message={
                        r.status === "active"
                          ? `Olá ${r.name.split(" ")[0]}, parabéns pela constância! Vamos manter o ritmo essa semana?`
                          : r.status === "watch"
                          ? `Olá ${r.name.split(" ")[0]}, notei que sua frequência caiu essa semana. Posso te ajudar com algo?`
                          : `Olá ${r.name.split(" ")[0]}, sentimos sua falta! Vamos retomar os treinos juntos?`
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <Metric icon={<LogIn className="h-3 w-3" />} label="Último acesso" value={fmtRelative(r.last_sign_in_at)} sub={fmtDate(r.last_sign_in_at)} />
                  <Metric icon={<CalendarCheck className="h-3 w-3" />} label={`Último check-in${r.last_checkin_source === "freebie" ? " (gratuito)" : ""}`} value={fmtRelative(r.last_checkin_at)} sub={fmtDate(r.last_checkin_at)} />
                  <Metric icon={<ShoppingBag className="h-3 w-3" />} label="Última compra" value={fmtRelative(r.last_purchase_at)} sub={fmtDate(r.last_purchase_at)} />
                  <Metric icon={<Activity className="h-3 w-3" />} label="Check-ins 30d" value={`${r.checkins_30d}`} sub={`${r.checkins_7d} essa sem · ${r.checkins_prev_7d} ant`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "orange" | "rose" | "red" }) {
  const toneClass = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    orange: "text-orange-400",
    rose: "text-rose-400",
    red: "text-red-400",
  }[tone];
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2">
      <p className="flex items-center gap-1 text-[10px] text-white/40">{icon} {label}</p>
      <p className="text-xs font-bold text-white">{value}</p>
      {sub && <p className="text-[10px] text-white/40">{sub}</p>}
    </div>
  );
}

export default AttendanceTab;
