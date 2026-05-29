import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Star, Trophy, Loader2, ExternalLink, Award, Dumbbell, TrendingDown } from "lucide-react";

type Gender = "M" | "F" | "all";
type Tab = "winners" | "fat" | "muscle" | "kg";

type HallEntry = {
  id: string;
  gender: string;
  result_kg: number | null;
  result_pct: number | null;
  prize_amount: number;
  student: { profile: { name: string; avatar_url: string | null } };
  coach: { profile: { name: string } };
  competition: { month: number; year: number };
};

type Enroll = {
  id: string;
  gender: string;
  initial_weight: number | null;
  final_weight: number | null;
  initial_body_fat: number | null;
  final_body_fat: number | null;
  initial_muscle_mass: number | null;
  final_muscle_mass: number | null;
  initial_share_url: string | null;
  final_share_url: string | null;
  result_fat_pct_lost: number | null;
  result_muscle_gain_pct: number | null;
  result_kg_lost: number | null;
  competition: { id: string; month: number; year: number } | null;
  student: { profile: { name: string; avatar_url: string | null } } | null;
  coach: { profile: { name: string } } | null;
};

const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  /** Se true, mostra ícone de auditoria (link compartilhamento). Para admin/coach. */
  showAudit?: boolean;
}

export function HallOfFame({ showAudit = false }: Props) {
  const [tab, setTab] = useState<Tab>("winners");
  const [winners, setWinners] = useState<HallEntry[]>([]);
  const [enrolls, setEnrolls] = useState<Enroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [gender, setGender] = useState<Gender>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [w, e] = await Promise.all([
        supabase
          .from("competition_hall_of_fame" as never)
          .select(`
            id, gender, result_kg, result_pct, prize_amount,
            student:student_id ( profile:profile_id ( name, avatar_url ) ),
            coach:coach_id ( profile:profile_id ( name ) ),
            competition:competition_id ( month, year )
          `)
          .order("created_at" as never, { ascending: false })
          .limit(500),
        supabase
          .from("competition_enrollments" as never)
          .select(`
            id, gender, initial_weight, final_weight,
            initial_body_fat, final_body_fat,
            initial_muscle_mass, final_muscle_mass,
            initial_share_url, final_share_url,
            result_fat_pct_lost, result_muscle_gain_pct, result_kg_lost,
            competition:competition_id ( id, month, year ),
            student:student_id ( profile:profile_id ( name, avatar_url ) ),
            coach:coach_id ( profile:profile_id ( name ) )
          `)
          .limit(2000),
      ]);
      setWinners((w.data as any[]) || []);
      setEnrolls((e.data as any[]) || []);
      setLoading(false);
    })();
  }, []);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    const add = (m?: number, y?: number) => { if (m && y) set.add(`${y}-${m}`); };
    winners.forEach(e => add(e.competition?.month, e.competition?.year));
    enrolls.forEach(e => add(e.competition?.month, e.competition?.year));
    return Array.from(set).sort((a, b) => {
      const [ya, ma] = a.split("-").map(Number); const [yb, mb] = b.split("-").map(Number);
      return yb !== ya ? yb - ya : mb - ma;
    });
  }, [winners, enrolls]);

  const matchesFilters = (m?: number, y?: number, g?: string) => {
    if (filter !== "all") {
      const [fy, fm] = filter.split("-").map(Number);
      if (y !== fy || m !== fm) return false;
    }
    if (gender !== "all" && g !== gender) return false;
    return true;
  };

  const filteredWinners = useMemo(() => winners.filter(w =>
    matchesFilters(w.competition?.month, w.competition?.year, w.gender)
  ), [winners, filter, gender]);

  const ranked = useMemo(() => {
    const base = enrolls.filter(e => matchesFilters(e.competition?.month, e.competition?.year, e.gender));
    const sorter = (key: "result_fat_pct_lost" | "result_muscle_gain_pct" | "result_kg_lost") => {
      // Only positive results qualify. Negative/zero (gained weight/fat, lost muscle) and missing data are excluded.
      return base
        .filter(e => {
          const v = e[key];
          return v != null && (v as number) > 0;
        })
        .sort((a, b) => ((b[key] ?? 0) as number) - ((a[key] ?? 0) as number));
    };
    return {
      fat: sorter("result_fat_pct_lost"),
      muscle: sorter("result_muscle_gain_pct"),
      kg: sorter("result_kg_lost"),
    };
  }, [enrolls, filter, gender]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const tabBtn = (id: Tab, label: string, Icon: any) => (
    <button onClick={() => setTab(id)}
      className={`flex items-center justify-center gap-1 rounded-lg py-2 px-2 text-[11px] font-bold ${tab === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
      <Icon className="h-3 w-3" /> {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 py-2">
        <Star className="h-5 w-5 text-yellow-400" />
        <h2 className="font-bold text-foreground">Hall da Fama</h2>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {tabBtn("winners", "Campeões", Trophy)}
        {tabBtn("fat", "% Gordura", TrendingDown)}
        {tabBtn("muscle", "% Músculo", Dumbbell)}
        {tabBtn("kg", "Kg perdidos", Award)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="rounded-lg bg-muted px-2 py-1.5 text-xs text-foreground border border-border">
          <option value="all">Todos os meses</option>
          {monthOptions.map(opt => {
            const [y, m] = opt.split("-").map(Number);
            return <option key={opt} value={opt}>{MONTHS[m]} {y}</option>;
          })}
        </select>
        {tab !== "winners" && (
          <div className="flex gap-1">
            {(["all", "M", "F"] as Gender[]).map(g => (
              <button key={g} onClick={() => setGender(g)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${gender === g
                  ? (g === "M" ? "bg-blue-500/20 text-blue-400" : g === "F" ? "bg-pink-500/20 text-pink-400" : "bg-primary text-primary-foreground")
                  : "bg-muted text-muted-foreground"}`}>
                {g === "all" ? "Todos" : g === "M" ? "Masculino" : "Feminino"}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "winners" && <WinnersList items={filteredWinners} />}
      {tab === "fat" && <RankList items={ranked.fat} metric="fat" showAudit={showAudit} />}
      {tab === "muscle" && <RankList items={ranked.muscle} metric="muscle" showAudit={showAudit} />}
      {tab === "kg" && <RankList items={ranked.kg} metric="kg" showAudit={showAudit} />}
    </div>
  );
}

function Avatar({ url, name }: { url: string | null | undefined; name: string }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return url ? (
    <img src={url} alt={name} className="h-11 w-11 rounded-full object-cover border-2 border-primary/40 flex-shrink-0" />
  ) : (
    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-muted text-foreground font-bold border-2 border-border">
      {initial}
    </div>
  );
}

function WinnersList({ items }: { items: HallEntry[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">Nenhum campeão no período.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((e, i) => (
        <div key={e.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Avatar url={e.student?.profile?.avatar_url} name={e.student?.profile?.name || "?"} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🏆"}</span>
                <p className="font-bold text-foreground truncate">{e.student?.profile?.name || "—"}</p>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Coach: {e.coach?.profile?.name || "—"} · {MONTHS[e.competition?.month || 0]} {e.competition?.year || ""}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-primary">{money(e.prize_amount)}</p>
              <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${e.gender === "M" ? "bg-blue-500/20 text-blue-400" : "bg-pink-500/20 text-pink-400"}`}>
                {e.gender === "M" ? "Masc." : "Fem."}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RankList({ items, metric, showAudit }: { items: Enroll[]; metric: "fat" | "muscle" | "kg"; showAudit: boolean }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <Award className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">Nenhum participante no período.</p>
      </div>
    );
  }
  const valueOf = (e: Enroll) => {
    if (metric === "fat") return e.result_fat_pct_lost;
    if (metric === "muscle") return e.result_muscle_gain_pct;
    return e.result_kg_lost;
  };
  const missingReason = (e: Enroll) => {
    if (metric === "fat") {
      if (e.initial_body_fat == null) return "Não realizou pesagem inicial";
      if (e.final_body_fat == null) return "Não realizou pesagem final";
    } else if (metric === "muscle") {
      if (e.initial_muscle_mass == null) return "Não realizou pesagem inicial";
      if (e.final_muscle_mass == null) return "Não realizou pesagem final";
    } else {
      if (e.initial_weight == null) return "Não realizou pesagem inicial";
      if (e.final_weight == null) return "Não realizou pesagem final";
    }
    return null;
  };
  const unit = metric === "kg" ? "kg" : "%";
  const fmtVal = (v: number | null) => v == null ? "—" : `${v > 0 ? "" : "+"}${Math.abs(v).toFixed(metric === "kg" ? 1 : 2)}${unit}`;

  return (
    <div className="space-y-2">
      {items.map((e, i) => {
        const miss = missingReason(e);
        const val = valueOf(e);
        const positive = val != null && val > 0;
        return (
          <div key={e.id} className={`rounded-2xl border bg-card p-3 ${miss ? "border-border opacity-70" : "border-border"}`}>
            <div className="flex items-center gap-3">
              <div className="w-6 text-center text-xs font-bold text-muted-foreground flex-shrink-0">
                {miss ? "—" : `${i + 1}º`}
              </div>
              <Avatar url={e.student?.profile?.avatar_url} name={e.student?.profile?.name || "?"} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm truncate">{e.student?.profile?.name || "—"}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {e.coach?.profile?.name || "—"} · {MONTHS[e.competition?.month || 0]} {e.competition?.year || ""}
                </p>
                {miss && <p className="text-[10px] text-yellow-500/80 mt-0.5">{miss}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                {miss ? (
                  <span className="text-xs text-muted-foreground">Sem resultado</span>
                ) : (
                  <p className={`text-base font-bold ${positive ? "text-green-400" : "text-red-400"}`}>
                    {fmtVal(val)}
                  </p>
                )}
                <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${e.gender === "M" ? "bg-blue-500/20 text-blue-400" : "bg-pink-500/20 text-pink-400"}`}>
                  {e.gender}
                </span>
              </div>
              {showAudit && (e.initial_share_url || e.final_share_url) && (
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {e.initial_share_url && (
                    <a href={e.initial_share_url} target="_blank" rel="noopener noreferrer"
                      title="Resultado inicial (auditoria)"
                      className="text-blue-400 hover:text-blue-300">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {e.final_share_url && (
                    <a href={e.final_share_url} target="_blank" rel="noopener noreferrer"
                      title="Resultado final (auditoria)"
                      className="text-green-400 hover:text-green-300">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
