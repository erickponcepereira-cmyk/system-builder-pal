import { Trophy, TrendingUp } from "lucide-react";
import { PatentBadge, type PatentLevel } from "./PatentBadge";

interface RankingEntry {
  position: number;
  name: string;
  patent: PatentLevel;
  students: number;
  revenue: number;
  isYou?: boolean;
}

const mockRanking: RankingEntry[] = [
  { position: 1, name: "Marina Silva", patent: "master_director", students: 312, revenue: 89400 },
  { position: 2, name: "Carlos Mendes", patent: "senior_director", students: 287, revenue: 78200 },
  { position: 3, name: "Patrícia Lima", patent: "director", students: 198, revenue: 56800 },
  { position: 4, name: "Você", patent: "senior_coach", students: 24, revenue: 3680, isYou: true },
  { position: 5, name: "Ricardo Alves", patent: "coach", students: 18, revenue: 2940 },
];

export function RankingTable() {
  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
            <Trophy className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Ranking mensal</h3>
            <p className="text-[11px] text-white/50">Top vendedores da rede</p>
          </div>
        </div>
        <button className="text-[11px] font-medium text-primary">Ver tudo</button>
      </div>

      <div className="space-y-2">
        {mockRanking.map((r) => (
          <div
            key={r.position}
            className={`flex items-center gap-3 rounded-xl p-3 ${r.isYou ? "ring-1 ring-primary/40" : ""}`}
            style={{ backgroundColor: r.isYou ? "rgba(255,66,48,0.08)" : "#0F0F0F" }}
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
              r.position === 1 ? "bg-red-500/20 text-red-400" :
              r.position === 2 ? "bg-gray-300/20 text-gray-300" :
              r.position === 3 ? "bg-red-600/20 text-red-500" :
              "bg-white/5 text-white/50"
            }`}>
              #{r.position}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-bold truncate ${r.isYou ? "text-primary" : "text-white"}`}>
                  {r.name}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <PatentBadge patent={r.patent} size="sm" showName={false} />
                <span className="text-[10px] text-white/40">{r.students} alunos</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-white">{fmt(r.revenue)}</p>
              <div className="flex items-center justify-end gap-0.5 text-[10px] text-success">
                <TrendingUp className="h-2.5 w-2.5" />
                <span>+12%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
