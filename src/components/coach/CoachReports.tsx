import { useEffect, useState } from "react";
import { CalendarCheck, BarChart3, User as UserIcon } from "lucide-react";
import {
  getCoachAttendanceHistory,
  type AttendanceHistory,
} from "@/server/google-calendar.functions";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function thisMonthISO() { return new Date().toISOString().slice(0, 7); }

export function CoachReports() {
  const [view, setView] = useState<"daily" | "monthly">("daily");
  const [day, setDay] = useState(todayISO());
  const [month, setMonth] = useState(thisMonthISO());
  const [data, setData] = useState<AttendanceHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCoachAttendanceHistory({ data: { day, month } })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [day, month]);

  const fmtDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const maxPerDay = Math.max(1, ...(data?.monthly.perDay.map((d) => d.total) ?? [0]));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Relatórios</h1>
        <p className="text-sm text-white/50">Histórico de atendimentos concluídos</p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setView("daily")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${view === "daily" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}>
          <CalendarCheck className="h-3.5 w-3.5 inline mr-1" /> Diário
        </button>
        <button onClick={() => setView("monthly")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${view === "monthly" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}>
          <BarChart3 className="h-3.5 w-3.5 inline mr-1" /> Mensal
        </button>
        <div className="ml-auto">
          {view === "daily" ? (
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
              className="rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 text-xs text-white" />
          ) : (
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 text-xs text-white" />
          )}
        </div>
      </div>

      {loading && <p className="text-xs text-white/50">Carregando...</p>}

      {!loading && data && view === "daily" && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">{fmtDate(data.daily.date)}</h3>
            <span className="text-2xl font-bold text-primary">{data.daily.total}</span>
          </div>
          {data.daily.items.length === 0 ? (
            <p className="text-sm text-white/50">Nenhum atendimento concluído neste dia.</p>
          ) : (
            <ul className="space-y-2">
              {data.daily.items.map((it) => (
                <li key={it.id} className="rounded-xl p-3 bg-black/30 border border-white/5">
                  <p className="text-sm font-semibold text-white">{it.summary}</p>
                  <p className="text-[11px] text-white/60 mt-0.5">{fmtTime(it.start)}</p>
                  {it.attendee && (
                    <p className="text-[11px] text-white/50 mt-1 flex items-center gap-1">
                      <UserIcon className="h-3 w-3" /> {it.attendee}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!loading && data && view === "monthly" && (
        <div className="space-y-4">
          <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-white">Total no mês</h3>
              <span className="text-3xl font-bold text-primary">{data.monthly.total}</span>
            </div>
            <p className="text-xs text-white/50">{data.monthly.month}</p>
          </div>

          <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
            <h3 className="text-sm font-bold text-white mb-4">Evolução diária</h3>
            {data.monthly.perDay.length === 0 ? (
              <p className="text-sm text-white/50">Sem dados neste mês.</p>
            ) : (
              <div className="space-y-1.5">
                {data.monthly.perDay.map((d) => (
                  <div key={d.date} className="flex items-center gap-3">
                    <span className="text-[11px] text-white/60 w-16 shrink-0">{fmtDate(d.date)}</span>
                    <div className="flex-1 h-5 bg-white/5 rounded">
                      <div className="h-full rounded bg-primary"
                        style={{ width: `${(d.total / maxPerDay) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-white w-8 text-right">{d.total}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
