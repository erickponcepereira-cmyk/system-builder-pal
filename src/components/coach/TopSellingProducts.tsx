import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, Trophy, Package, Layers, Loader2, Medal } from "lucide-react";

type Row = {
  section_id: string | null;
  section_name: string;
  category_id: string | null;
  category_name: string;
  product_id: string;
  product_name: string;
  qty: number;
};

type ProductNode = { id: string; name: string; qty: number; rank: number };
type CategoryNode = { id: string; name: string; qty: number; rank: number; products: ProductNode[] };
type SectionNode = { id: string; name: string; qty: number; rank: number; categories: CategoryNode[] };

const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <Medal className="h-4 w-4" style={{ color: RANK_COLORS[rank - 1] }} />
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/70">
      {rank}
    </span>
  );
}

export function TopSellingProducts({ coachProfileId }: { coachProfileId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!coachProfileId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // 1) Get paid commissions (level 0 = direct sale) for this coach
      const { data: comms } = await supabase
        .from("commissions")
        .select("transaction_id")
        .eq("beneficiary_profile_id", coachProfileId)
        .eq("level", 0);
      const txIds = Array.from(new Set((comms || []).map((c: any) => c.transaction_id))).filter(Boolean);
      if (txIds.length === 0) { if (!cancelled) { setRows([]); setLoading(false); } return; }

      const { data: txs } = await supabase
        .from("transactions")
        .select("id,product_id,status")
        .in("id", txIds as string[])
        .eq("status", "paid");
      const prodIds = Array.from(new Set((txs || []).map((t: any) => t.product_id))).filter(Boolean);
      if (prodIds.length === 0) { if (!cancelled) { setRows([]); setLoading(false); } return; }

      const { data: prods } = await supabase
        .from("products")
        .select("id,name,category_id")
        .in("id", prodIds as string[]);

      const catIds = Array.from(new Set((prods || []).map((p: any) => p.category_id).filter(Boolean)));
      const { data: cats } = catIds.length
        ? await supabase.from("store_categories").select("id,name,section_id").in("id", catIds as string[])
        : { data: [] as any[] };
      const sectionIds = Array.from(new Set((cats || []).map((c: any) => c.section_id).filter(Boolean)));
      const { data: secs } = sectionIds.length
        ? await supabase.from("store_sections").select("id,name").in("id", sectionIds as string[])
        : { data: [] as any[] };

      const prodMap = new Map<string, any>((prods || []).map((p: any) => [p.id, p]));
      const catMap = new Map<string, any>((cats || []).map((c: any) => [c.id, c]));
      const secMap = new Map<string, any>((secs || []).map((s: any) => [s.id, s]));

      // Count per product
      const counts = new Map<string, number>();
      (txs || []).forEach((t: any) => counts.set(t.product_id, (counts.get(t.product_id) || 0) + 1));

      const result: Row[] = [];
      counts.forEach((qty, pid) => {
        const p = prodMap.get(pid);
        if (!p) return;
        const c = p.category_id ? catMap.get(p.category_id) : null;
        const s = c?.section_id ? secMap.get(c.section_id) : null;
        result.push({
          section_id: s?.id || null,
          section_name: s?.name || "Sem categoria",
          category_id: c?.id || null,
          category_name: c?.name || "Sem subcategoria",
          product_id: pid,
          product_name: p.name,
          qty,
        });
      });

      if (!cancelled) {
        setRows(result);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [coachProfileId]);

  const tree: SectionNode[] = useMemo(() => {
    const sMap = new Map<string, SectionNode>();
    rows.forEach((r) => {
      const sKey = r.section_id || `none-${r.section_name}`;
      if (!sMap.has(sKey)) sMap.set(sKey, { id: sKey, name: r.section_name, qty: 0, rank: 0, categories: [] });
      const sec = sMap.get(sKey)!;
      sec.qty += r.qty;
      const cKey = r.category_id || `none-${r.category_name}`;
      let cat = sec.categories.find((c) => c.id === cKey);
      if (!cat) { cat = { id: cKey, name: r.category_name, qty: 0, rank: 0, products: [] }; sec.categories.push(cat); }
      cat.qty += r.qty;
      cat.products.push({ id: r.product_id, name: r.product_name, qty: r.qty, rank: 0 });
    });
    const arr = Array.from(sMap.values());
    arr.forEach((s) => {
      s.categories.sort((a, b) => b.qty - a.qty);
      s.categories = s.categories.slice(0, 10).map((c, i) => ({ ...c, rank: i + 1 }));
      s.categories.forEach((c) => {
        c.products.sort((a, b) => b.qty - a.qty);
        c.products = c.products.slice(0, 10).map((p, i) => ({ ...p, rank: i + 1 }));
      });
    });
    arr.sort((a, b) => b.qty - a.qty);
    return arr.slice(0, 10).map((s, i) => ({ ...s, rank: i + 1 }));
  }, [rows]);

  const total = useMemo(() => tree.reduce((s, n) => s + n.qty, 0), [tree]);

  if (loading) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        <p className="mt-2 text-sm text-white/50">Calculando suas conquistas...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-white">Produtos mais vendidos</h2>
            <p className="text-xs text-white/45">Suas conquistas por categoria e produto</p>
          </div>
        </div>
        <div className="rounded-xl bg-primary/15 px-3 py-2 text-right">
          <p className="text-[10px] uppercase text-primary/80">Total vendido</p>
          <p className="text-xl font-bold text-primary">{total}</p>
        </div>
      </div>

      {tree.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
          <Package className="mx-auto h-8 w-8 text-white/30" />
          <p className="mt-2 text-sm text-white/50">Nenhuma venda registrada ainda.</p>
          <p className="text-xs text-white/35">Quando suas vendas forem pagas, elas aparecerão aqui como conquistas.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tree.map((sec) => {
            const isOpen = openSections[sec.id] ?? true;
            return (
              <div key={sec.id} className="overflow-hidden rounded-xl border border-white/5" style={{ backgroundColor: "#0F0F0F" }}>
                <button
                  onClick={() => setOpenSections((p) => ({ ...p, [sec.id]: !isOpen }))}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <RankBadge rank={sec.rank} />
                    {isOpen ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-white/40" />}
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="font-bold text-white">{sec.name}</span>
                  </div>
                  <span className="rounded-full bg-primary/20 px-3 py-1 text-sm font-bold text-primary">{sec.qty}</span>
                </button>
                {isOpen && (
                  <div className="space-y-1 border-t border-white/5 p-2">
                    {sec.categories.map((cat) => {
                      const catKey = `${sec.id}-${cat.id}`;
                      const catOpen = openCategories[catKey] ?? false;
                      return (
                        <div key={cat.id} className="rounded-lg" style={{ backgroundColor: "#161616" }}>
                          <button
                            onClick={() => setOpenCategories((p) => ({ ...p, [catKey]: !catOpen }))}
                            className="flex w-full items-center justify-between gap-3 p-3 text-left transition hover:bg-white/5"
                          >
                            <div className="flex items-center gap-2">
                              <RankBadge rank={cat.rank} />
                              {catOpen ? <ChevronDown className="h-3.5 w-3.5 text-white/60" /> : <ChevronRight className="h-3.5 w-3.5 text-white/40" />}
                              <span className="text-sm font-medium text-white/90">{cat.name}</span>
                            </div>
                            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-white/80">{cat.qty}</span>
                          </button>
                          {catOpen && (
                            <div className="space-y-1 border-t border-white/5 p-2">
                              {cat.products.map((p) => (
                                <div key={p.id} className="flex items-center justify-between gap-3 rounded-md px-3 py-2" style={{ backgroundColor: "#0B0B0B" }}>
                                  <div className="flex items-center gap-2">
                                    <RankBadge rank={p.rank} />
                                    <Package className="h-3 w-3 text-white/40" />
                                    <span className="text-xs text-white/80">{p.name}</span>
                                  </div>
                                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">{p.qty}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TopSellingProducts;
