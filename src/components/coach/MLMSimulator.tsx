import { useState, useMemo } from "react";
import { Calculator, TrendingUp, Users, DollarSign } from "lucide-react";

const COMMISSION_RATES = {
  coach: 50,
  level1: 15,
  level2: 5,
  level3: 3,
  level4: 0,
  level5: 0,
} as const;

export function MLMSimulator() {
  const [productPrice, setProductPrice] = useState(197);
  const [directStudents, setDirectStudents] = useState(20);
  const [networkLevels, setNetworkLevels] = useState({
    level1: 10, // alunos de cada um dos seus indicados
    level2: 5,
    level3: 3,
  });

  const result = useMemo(() => {
    // Comissão direta (você como coach)
    const directRevenue = directStudents * productPrice * (COMMISSION_RATES.coach / 100);

    // Rede nível 1: cada aluno seu indicou X alunos
    const level1Count = directStudents * networkLevels.level1;
    const level1Revenue = level1Count * productPrice * (COMMISSION_RATES.level1 / 100);

    // Rede nível 2
    const level2Count = level1Count * networkLevels.level2;
    const level2Revenue = level2Count * productPrice * (COMMISSION_RATES.level2 / 100);

    // Rede nível 3
    const level3Count = level2Count * networkLevels.level3;
    const level3Revenue = level3Count * productPrice * (COMMISSION_RATES.level3 / 100);

    const totalNetwork = level1Count + level2Count + level3Count;
    const totalMonthly = directRevenue + level1Revenue + level2Revenue + level3Revenue;

    return {
      directRevenue,
      level1Revenue,
      level1Count,
      level2Revenue,
      level2Count,
      level3Revenue,
      level3Count,
      totalNetwork,
      totalMonthly,
      totalAnnual: totalMonthly * 12,
    };
  }, [productPrice, directStudents, networkLevels]);

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
          <Calculator className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Simulador MLM</h3>
          <p className="text-[11px] text-white/50">Veja seu potencial de ganhos</p>
        </div>
      </div>

      {/* Inputs */}
      <div className="space-y-3 mb-5">
        <div>
          <label className="flex items-center justify-between text-xs text-white/60 mb-1.5">
            <span>Preço do produto</span>
            <span className="font-bold text-white">{fmt(productPrice)}</span>
          </label>
          <input
            type="range"
            min={49}
            max={997}
            step={10}
            value={productPrice}
            onChange={(e) => setProductPrice(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <label className="flex items-center justify-between text-xs text-white/60 mb-1.5">
            <span>Seus alunos diretos</span>
            <span className="font-bold text-white">{directStudents}</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={directStudents}
            onChange={(e) => setDirectStudents(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(["level1", "level2", "level3"] as const).map((lvl, i) => (
            <div key={lvl}>
              <label className="block text-[10px] text-white/50 mb-1">
                Nível {i + 1} (média)
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={networkLevels[lvl]}
                onChange={(e) =>
                  setNetworkLevels({ ...networkLevels, [lvl]: Number(e.target.value) || 0 })
                }
                className="w-full rounded-lg px-2 py-1.5 text-sm font-bold text-white outline-none focus:ring-1 focus:ring-primary"
                style={{ backgroundColor: "#252525" }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-1.5 mb-4">
        <Row label="Direto (50%)" value={fmt(result.directRevenue)} sublabel={`${directStudents} alunos`} />
        <Row label="Nível 1 (15%)" value={fmt(result.level1Revenue)} sublabel={`${result.level1Count} alunos`} />
        <Row label="Nível 2 (5%)" value={fmt(result.level2Revenue)} sublabel={`${result.level2Count} alunos`} />
        <Row label="Nível 3 (3%)" value={fmt(result.level3Revenue)} sublabel={`${result.level3Count} alunos`} />
      </div>

      {/* Total */}
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.2), hsl(var(--primary)/0.05))" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-primary" />
            <span className="text-xs text-white/70">Receita mensal estimada</span>
          </div>
          <span className="text-xl font-bold text-primary">{fmt(result.totalMonthly)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-white/50" />
            <div>
              <p className="text-[9px] text-white/40 uppercase">Rede total</p>
              <p className="text-sm font-bold text-white">{result.totalNetwork}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-white/50" />
            <div>
              <p className="text-[9px] text-white/40 uppercase">Anual</p>
              <p className="text-sm font-bold text-white">{fmt(result.totalAnnual)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: "#0F0F0F" }}>
      <div>
        <p className="text-xs text-white/70">{label}</p>
        <p className="text-[10px] text-white/40">{sublabel}</p>
      </div>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  );
}
