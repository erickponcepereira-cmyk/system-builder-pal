import { useState, useMemo, useEffect } from "react";
import { Calculator, TrendingUp, Users, DollarSign, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listSimulatorProducts } from "@/lib/coach-network.functions";

type Product = {
  id: string;
  name: string;
  price: number;
  coach_real_commission: number;
  network_l1_real: number;
  network_l2_real: number;
  network_l3_real: number;
};

export function MLMSimulator() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [directStudents, setDirectStudents] = useState(20);
  const [networkLevels, setNetworkLevels] = useState({
    level1: 10,
    level2: 5,
    level3: 3,
  });
  const [loading, setLoading] = useState(true);

  const fetchProducts = useServerFn(listSimulatorProducts);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchProducts();
        setProducts(list as Product[]);
        if (list.length > 0) {
          setProductId(list[0].id);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId]
  );

  const perSale = useMemo(
    () => ({
      coach: selectedProduct?.coach_real_commission ?? 0,
      l1: selectedProduct?.network_l1_real ?? 0,
      l2: selectedProduct?.network_l2_real ?? 0,
      l3: selectedProduct?.network_l3_real ?? 0,
    }),
    [selectedProduct]
  );

  const result = useMemo(() => {
    const directRevenue = directStudents * perSale.coach;
    const level1Count = directStudents * networkLevels.level1;
    const level1Revenue = level1Count * perSale.l1;
    const level2Count = level1Count * networkLevels.level2;
    const level2Revenue = level2Count * perSale.l2;
    const level3Count = level2Count * networkLevels.level3;
    const level3Revenue = level3Count * perSale.l3;

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
  }, [directStudents, networkLevels, perSale]);

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

      {/* Product selector */}
      <div className="mb-4">
        <label className="block text-xs text-white/60 mb-1.5">Produto</label>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando produtos...
          </div>
        ) : (
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
            style={{ backgroundColor: "#252525" }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {fmt(p.price)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Inputs */}
      <div className="space-y-3 mb-5">
        <div className="rounded-lg px-3 py-2 text-[11px] text-white/60" style={{ backgroundColor: "#0F0F0F" }}>
          Ganho por venda direta: <b className="text-success">{fmt(perSale.coach)}</b> · Rede L1 {fmt(perSale.l1)} · L2 {fmt(perSale.l2)} · L3 {fmt(perSale.l3)}
        </div>


        <div>
          <label className="flex items-center justify-between text-xs text-white/60 mb-1.5">
            <span>Seus alunos diretos</span>
            <input
              type="number"
              min={0}
              value={directStudents}
              onChange={(e) => setDirectStudents(Math.max(0, +e.target.value || 0))}
              className="w-20 rounded-md px-2 py-1 text-xs font-bold text-white text-right outline-none focus:ring-1 focus:ring-primary"
              style={{ backgroundColor: "#252525" }}
            />
          </label>
          <input
            type="range"
            min={0}
            max={500}
            value={directStudents}
            onChange={(e) => setDirectStudents(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(["level1", "level2", "level3"] as const).map((lvl, i) => (
            <div key={lvl}>
              <label className="block text-[10px] text-white/50 mb-1">
                Upline {i + 1} (média)
              </label>
              <input
                type="number"
                min={0}
                value={networkLevels[lvl]}
                onChange={(e) =>
                  setNetworkLevels({ ...networkLevels, [lvl]: Math.max(0, +e.target.value || 0) })
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
        <Row label={`Direto (${rates.coach}%) — você como coach`} value={fmt(result.directRevenue)} sublabel={`${directStudents} alunos`} />
        <Row label={`Upline 1 (${rates.level1}%) — indicação direta`} value={fmt(result.level1Revenue)} sublabel={`${result.level1Count} alunos`} />
        <Row label={`Upline 2 (${rates.level2}%) — abaixo do Upline 1`} value={fmt(result.level2Revenue)} sublabel={`${result.level2Count} alunos`} />
        <Row label={`Upline 3 (${rates.level3}%) — abaixo do Upline 2`} value={fmt(result.level3Revenue)} sublabel={`${result.level3Count} alunos`} />
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
