import { useEffect, useState } from "react";
import { Trophy, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PatentBadge, type PatentLevel } from "./PatentBadge";

interface RankingEntry {
  position: number;
  coachId: string;
  name: string;
  patent: PatentLevel;
  totalPoints: number;
  totalRevenue: number;
  isYou?: boolean;
}

export function RankingTable() {
  const [ranking, setRanking] = useState<RankingEntry[] | null>(null);
  const [myCoachId, setMyCoachId] = useState<string | null>(null);

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  useEffect(() => {
    (async () => {
      // Obtém o coachId do usuário atual
      const { data: userData } = await supabase.auth.getUser();
      let selfCoachId: string | null = null;
      if (userData?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (profile?.id) {
          const { data: coach } = await supabase
            .from("coaches")
            .select("id")
            .eq("profile_id", profile.id)
            .maybeSingle();
          selfCoachId = coach?.id ?? null;
          setMyCoachId(selfCoachId);
        }
      }

      // Busca ranking do mês atual com dados reais
      const refMonth = new Date();
      refMonth.setDate(1);
      const monthStr = refMonth.toISOString().slice(0, 10);

      const { data: rows } = await supabase
        .from("monthly_rankings")
        .select(`
          id, coach_id, ranking_position, total_points, total_revenue,
          coaches (
            id, profile_id,
            profiles ( full_name )
          )
        `)
        .eq("reference_month", monthStr)
        .order("ranking_position", { ascending: true, nullsFirst: false })
        .limit(10);

      if (!rows || rows.length === 0) {
        setRanking([]);
        return;
      }

      // Busca patentes dos coaches
      const coachIds = rows.map((r: any) => r.coach_id).filter(Boolean);
      const { data: patents } = await supabase
        .from("patent_rules")
        .select("patent");

      // Busca patente atual de cada coach via profile
      const entries: RankingEntry[] = rows.map((r: any, i: number) => {
        const coach = r.coaches as any;
        const name = coach?.profiles?.full_name || "Coach";
        return {
          position:     r.ranking_position ?? i + 1,
          coachId:      r.coach_id,
          name,
          patent:       "coach" as PatentLevel, // Será atualizado se tivermos dados
          totalPoints:  r.total_points ?? 0,
          totalRevenue: r.total_revenue ?? 0,
          isYou:        r.coach_id === selfCoachId,
        };
      });

      // Inclui o próprio coach se não estiver no top-10
      if (selfCoachId && !entries.find((e) => e.isYou)) {
        const { data: myRank } = await supabase
          .from("monthly_rankings")
          .select("ranking_position, total_points, total_revenue")
          .eq("reference_month", monthStr)
          .eq("coach_id", selfCoachId)
          .maybeSingle();

        if (myRank) {
          const { data: myProfile } = await supabase
            .from("coaches")
            .select("profiles(full_name)")
            .eq("id", selfCoachId)
            .maybeSingle();
          entries.push({
            position:     myRank.ranking_position ?? 99,
            coachId:      selfCoachId,
            name:         (myProfile as any)?.profiles?.full_name || "Você",
            patent:       "coach" as PatentLevel,
            totalPoints:  myRank.total_points ?? 0,
            totalRevenue: myRank.total_revenue ?? 0,
            isYou:        true,
          });
        }
      }

      setRanking(entries);
    })();
  }, []);

  const currentMonth = new Date().toLocaleString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
            <Trophy className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Ranking mensal</h3>
            <p className="text-[11px] text-white/50 capitalize">{currentMonth}</p>
          </div>
        </div>
      </div>

      {ranking === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-white/30" />
        </div>
      ) : ranking.length === 0 ? (
        <div className="text-center py-6">
          <Trophy className="h-8 w-8 text-white/10 mx-auto mb-2" />
          <p className="text-xs text-white/30">Nenhuma venda registrada este mês.</p>
          <p className="text-[11px] text-white/20 mt-0.5">O ranking será atualizado automaticamente com as vendas pagas.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ranking.map((r) => (
            <div
              key={r.coachId}
              className={`flex items-center gap-3 rounded-xl p-3 ${r.isYou ? "ring-1 ring-primary/40" : ""}`}
              style={{ backgroundColor: r.isYou ? "rgba(255,66,48,0.08)" : "#0F0F0F" }}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                r.position === 1 ? "bg-amber-500/20 text-amber-300" :
                r.position === 2 ? "bg-gray-300/20 text-gray-300" :
                r.position === 3 ? "bg-orange-600/20 text-orange-400" :
                "bg-white/5 text-white/50"
              }`}>
                #{r.position}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${r.isYou ? "text-primary" : "text-white"}`}>
                  {r.isYou ? `${r.name} (você)` : r.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-white/40">{r.totalPoints} pts</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-white">{fmt(r.totalRevenue)}</p>
                <div className="flex items-center justify-end gap-0.5 text-[10px] text-primary">
                  <TrendingUp className="h-2.5 w-2.5" />
                  <span>{r.totalPoints} pts</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
