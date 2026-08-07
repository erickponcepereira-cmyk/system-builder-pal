import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronDown, ChevronUp, Calendar, CalendarDays, X, Pencil } from "lucide-react";
import { WindowMethod } from "@/components/student/WindowMethod";
import { todayISOLocal, formatDateOnlyBR, addDaysISO } from "@/lib/date-only";

type LogRow = {
  log_date: string;
  goal: "slim" | "mass";
  meal_1_protein: boolean; meal_1_fiber: boolean; meal_1_carb: boolean;
  meal_2_protein: boolean; meal_2_fiber: boolean; meal_2_carb: boolean;
  meal_3_protein: boolean; meal_3_fiber: boolean; meal_3_carb: boolean;
  meal_4_protein: boolean; meal_4_fiber: boolean; meal_4_carb: boolean;
  meal_5_protein: boolean; meal_5_fiber: boolean; meal_5_carb: boolean;
  meal_6_protein: boolean; meal_6_fiber: boolean; meal_6_carb: boolean;
};

function summarize(r: LogRow) {
  let closed = 0, half = 0, open = 0;
  for (let n = 1; n <= 6; n++) {
    const p = (r as any)[`meal_${n}_protein`];
    const f = (r as any)[`meal_${n}_fiber`];
    const c = (r as any)[`meal_${n}_carb`];
    const required = r.goal === "mass" ? [p, f, c] : [p, f];
    const checked = required.filter(Boolean).length;
    if (checked === required.length) closed++;
    else if (checked > 0) half++;
    else open++;
  }
  return { closed, half, open };
}

type Period = 7 | 30 | 0;

export function WindowMethodHistory({ studentId, onEditDate }: { studentId: string; onEditDate?: (date: string) => void }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [period, setPeriod] = useState<Period>(30);
  const [dayFilter, setDayFilter] = useState("");
  const today = todayISOLocal();

  useEffect(() => {
    if (!studentId) return;
    supabase
      .from("window_method_logs" as never)
      .select("*")
      .eq("student_id" as never, studentId)
      .order("log_date" as never, { ascending: false })
      .limit(365)
      .then(({ data }) => {
        setLogs((data as any[]) || []);
        setLoading(false);
      });
  }, [studentId]);

  const filtered = useMemo(() => {
    let list = logs;
    if (dayFilter) return list.filter((r) => r.log_date === dayFilter);
    if (period) {
      const min = addDaysISO(today, -(period - 1));
      list = list.filter((r) => r.log_date >= min);
    }
    return list;
  }, [logs, dayFilter, period, today]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>;
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-xl bg-white/5 p-4 text-center">
        <p className="text-xs text-white/60">Nenhum registro do Método das Janelas ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2.5 hover:bg-white/[0.08] transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          <CalendarDays className="h-4 w-4 text-primary" />
          Resultados por dia
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">{logs.length}</span>
        </span>
        {collapsed ? <ChevronDown className="h-4 w-4 text-white/40" /> : <ChevronUp className="h-4 w-4 text-white/40" />}
      </button>

      {!collapsed && (
        <>
          <div className="space-y-2 rounded-xl bg-white/[0.03] p-3">
            <div className="flex flex-wrap gap-1.5">
              {([7, 30, 0] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); setDayFilter(""); }}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${!dayFilter && period === p ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
                >
                  {p === 0 ? "Todos" : `${p} dias`}
                </button>
              ))}
              {expanded && (
                <button onClick={() => setExpanded(null)} className="ml-auto rounded-lg bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/60 hover:bg-white/10">
                  Recolher tudo
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5">
              <Calendar className="h-4 w-4 shrink-0 text-primary" />
              <input
                type="date"
                value={dayFilter}
                max={today}
                onChange={(e) => setDayFilter(e.target.value)}
                className="w-full bg-transparent text-xs font-semibold text-white outline-none"
              />
              {dayFilter && (
                <button onClick={() => setDayFilter("")} aria-label="Limpar filtro" className="text-white/40 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-xl bg-white/5 p-4 text-center text-xs text-white/50">Nenhum registro para o filtro selecionado.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => {
                const { closed, half, open } = summarize(r);
                const score = Math.round((closed * 2 + half * 1) / 12 * 100);
                const isToday = r.log_date === today;
                const isOpen = expanded === r.log_date;
                return (
                  <div key={r.log_date} className="rounded-xl bg-white/5 overflow-hidden">
                    <button
                      onClick={() => setExpanded(isOpen ? null : r.log_date)}
                      className="w-full flex items-center justify-between gap-2 p-3 hover:bg-white/[0.07] transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Calendar className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {formatDateOnlyBR(r.log_date, { weekday: "short", day: "2-digit", month: "short" })}
                            {isToday && <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">HOJE</span>}
                          </p>
                          <p className="text-[11px] text-white/40">{r.goal === "slim" ? "Emagrecer" : "Ganhar Massa"} · {closed} fechadas · {half} meio · {open} abertas</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-bold ${score >= 70 ? "text-green-400" : score >= 40 ? "text-yellow-400" : "text-red-400"}`}>{score}%</span>
                        {isOpen ? <ChevronUp className="h-4 w-4 text-white/40" /> : <ChevronDown className="h-4 w-4 text-white/40" />}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-white/5 p-3 space-y-3">
                        {onEditDate && (
                          <button
                            onClick={() => onEditDate(r.log_date)}
                            className="flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/25"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Editar este dia
                          </button>
                        )}
                        <WindowMethod studentId={studentId} date={r.log_date} readOnly hideExplanation />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
