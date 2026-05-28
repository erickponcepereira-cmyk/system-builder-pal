import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Star, Trophy, Loader2 } from "lucide-react";

type HallEntry = {
  id: string;
  gender: string;
  initial_weight: number;
  final_weight: number;
  result_kg: number;
  result_pct: number;
  prize_amount: number;
  created_at: string;
  student: { profile: { name: string; photo_url: string | null; avatar_url: string | null } };
  coach: { profile: { name: string } };
  competition: { month: number; year: number };
};

const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function HallOfFame() {
  const [entries, setEntries] = useState<HallEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all"); // "all" or "YYYY-M"

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("competition_hall_of_fame" as never)
        .select(`
          id, gender, initial_weight, final_weight, result_kg, result_pct,
          prize_amount, created_at,
          student:student_id ( profile:profile_id ( name, photo_url, avatar_url ) ),
          coach:coach_id ( profile:profile_id ( name ) ),
          competition:competition_id ( month, year )
        `)
        .order("created_at" as never, { ascending: false })
        .limit(200);
      setEntries((data as any[]) || []);
      setLoading(false);
    })();
  }, []);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => {
      const c = (e.competition as any);
      if (c?.month && c?.year) set.add(`${c.year}-${c.month}`);
    });
    return Array.from(set).sort((a, b) => {
      const [ya, ma] = a.split("-").map(Number);
      const [yb, mb] = b.split("-").map(Number);
      return yb !== ya ? yb - ya : mb - ma;
    });
  }, [entries]);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    const [y, m] = filter.split("-").map(Number);
    return entries.filter(e => {
      const c = (e.competition as any);
      return c?.year === y && c?.month === m;
    });
  }, [entries, filter]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-400" />
          <h2 className="font-bold text-foreground">Campeões FitMind</h2>
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="rounded-lg bg-muted px-3 py-1.5 text-xs text-foreground border border-border"
        >
          <option value="all">Todos os meses</option>
          {monthOptions.map(opt => {
            const [y, m] = opt.split("-").map(Number);
            return <option key={opt} value={opt}>{MONTHS[m]} {y}</option>;
          })}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Nenhum campeão no período selecionado.</p>
        </div>
      ) : filtered.map((entry, i) => {
        const photo = entry.student?.profile?.photo_url || entry.student?.profile?.avatar_url;
        const initial = (entry.student?.profile?.name || "?").charAt(0).toUpperCase();
        return (
          <div key={entry.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              {photo ? (
                <img src={photo} alt={entry.student?.profile?.name || ""}
                  className="h-12 w-12 rounded-full object-cover border-2 border-primary/40" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground font-bold border-2 border-border">
                  {initial}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🏆"}</span>
                  <p className="font-bold text-foreground truncate">{entry.student?.profile?.name || "—"}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  Coach: {entry.coach?.profile?.name || "—"} · {MONTHS[(entry.competition as any)?.month]} {(entry.competition as any)?.year}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-lg font-bold ${entry.result_kg > 0 ? "text-green-400" : "text-red-400"}`}>
                  {entry.result_kg > 0 ? "−" : "+"}{Math.abs(entry.result_pct)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {entry.result_kg > 0 ? "−" : "+"}{Math.abs(entry.result_kg)} kg
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {entry.initial_weight} kg → {entry.final_weight} kg
              </span>
              <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                entry.gender === "M" ? "bg-blue-500/20 text-blue-400" : "bg-pink-500/20 text-pink-400"
              }`}>
                {entry.gender === "M" ? "Masculino" : "Feminino"}
              </span>
              <span className="text-xs font-bold text-primary">
                {money(entry.prize_amount)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
