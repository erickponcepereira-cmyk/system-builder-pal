import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { WindowMethod } from "@/components/student/WindowMethod";

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

export function WindowMethodHistory({ studentId }: { studentId: string }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!studentId) return;
    supabase
      .from("window_method_logs" as never)
      .select("*")
      .eq("student_id" as never, studentId)
      .order("log_date" as never, { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setLogs((data as any[]) || []);
        setLoading(false);
      });
  }, [studentId]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>;
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-xl bg-white/5 p-4 text-center">
        <p className="text-xs text-white/60">Seu coach ainda não preencheu o Método das Janelas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((r) => {
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
                    {new Date(r.log_date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
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
              <div className="border-t border-white/5 p-3">
                <WindowMethod studentId={studentId} date={r.log_date} readOnly hideExplanation />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
