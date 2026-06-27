import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, Trophy, Package, Layers, Loader2, Medal, Calendar } from "lucide-react";

type SaleRow = {
  product_id: string;
  qty: number;
  revenue: number;
};

type ProductMeta = { id: string; name: string; category_id: string | null; section_id: string | null };

type ProductNode = { id: string; name: string; qty: number; revenue: number; rank: number };
type CategoryNode = { id: string; name: string; qty: number; revenue: number; rank: number; products: ProductNode[] };
type SectionNode = { id: string; name: string; qty: number; revenue: number; rank: number; categories: CategoryNode[] };

const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

type PeriodKey = "all" | "month" | "30d" | "custom";

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return <Medal className="h-4 w-4" style={{ color: RANK_COLORS[rank - 1] }} />;
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/70">
      {rank}
    </span>
  );
}

function getRange(period: PeriodKey, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (period === "month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null };
  }
  if (period === "30d") {
    const d = new Date(); d.setDate(d.getDate() - 30); return { from: d, to: null };
  }
  if (period === "custom") {
    return {
      from: customFrom ? new Date(customFrom + "T00:00:00") : null,
      to: customTo ? new Date(customTo + "T23:59:59") : null,
    };
  }
  return { from: null, to: null };
}

export function TopSellingProducts({ coachProfileId }: { coachProfileId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Map<string, SaleRow>>(new Map());
  const [allProducts, setAllProducts] = useState<ProductMeta[]>([]);
  const [allCategories, setAllCategories] = useState<Array<{ id: string; name: string; section_id: string | null }>>([]);
  const [allSections, setAllSections] = useState<Array<{ id: string; name: string }>>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [limitMode, setLimitMode] = useState<10 | 20 | "all">(10);

  // Load taxonomy once
  useEffect(() => {
    (async () => {
      const [secsRes, catsRes, prodsRes] = await Promise.all([
        supabase.from("store_sections").select("id,name").order("name"),
        supabase.from("store_categories").select("id,name,section_id").order("name"),
        supabase.from("products").select("id,name,category_id,section_id"),
      ]);
      setAllSections((secsRes.data as any[]) || []);
      setAllCategories((catsRes.data as any[]) || []);
      setAllProducts((prodsRes.data as any[]) || []);
    })();
  }, []);

  // Load sales when filters change
  useEffect(() => {
    if (!coachProfileId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { from, to } = getRange(period, customFrom, customTo);
      const { getClientCutoffIso } = await import("@/lib/test-mode");
      const cutoff = await getClientCutoffIso();

      let commQ = supabase
        .from("commissions")
        .select("transaction_id,partner_order_id,created_at")
        .eq("beneficiary_profile_id", coachProfileId)
        .eq("level", 0);
      if (cutoff) commQ = commQ.gte("created_at", cutoff);
      const { data: comms } = await commQ;
      const txIds = Array.from(new Set((comms || []).map((c: any) => c.transaction_id))).filter(Boolean);
      const partnerOrderIds = Array.from(new Set((comms || []).map((c: any) => c.partner_order_id))).filter(Boolean);

      const map = new Map<string, SaleRow>();
      const extraProducts: ProductMeta[] = [];

      if (txIds.length > 0) {
        let q = supabase
          .from("transactions")
          .select("id,product_id,status,gross_amount,paid_at,created_at")
          .in("id", txIds as string[])
          .eq("status", "paid");
        if (from) q = q.gte("paid_at", from.toISOString());
        if (to) q = q.lte("paid_at", to.toISOString());
        if (cutoff) q = q.gte("paid_at", cutoff);
        const { data: txs } = await q;

        (txs || []).forEach((t: any) => {
          if (!t.product_id) return;
          const existing = map.get(t.product_id) || { product_id: t.product_id, qty: 0, revenue: 0 };
          existing.qty += 1;
          existing.revenue += Number(t.gross_amount) || 0;
          map.set(t.product_id, existing);
        });
      }

      if (partnerOrderIds.length > 0) {
        let poQ = (supabase as any)
          .from("partner_product_orders" as any)
          .select("id,partner_product_id,professional_product_id,gross_amount,paid_at,status" as any)
          .in("id" as any, partnerOrderIds as any)
          .eq("status" as any, "paid" as any);
        if (from) poQ = poQ.gte("paid_at" as any, from.toISOString() as any);
        if (to) poQ = poQ.lte("paid_at" as any, to.toISOString() as any);
        if (cutoff) poQ = poQ.gte("paid_at" as any, cutoff as any);
        const { data: ordersData } = await poQ;
        const orders = (ordersData as any[]) || [];
        const partnerIds = Array.from(new Set(orders.map((o) => o.partner_product_id).filter(Boolean)));
        const professionalIds = Array.from(new Set(orders.map((o) => o.professional_product_id).filter(Boolean)));
        const [partnerProductsRes, professionalProductsRes] = await Promise.all([
          partnerIds.length
            ? supabase.from("partner_products" as any).select("id,name" as any).in("id" as any, partnerIds as any)
            : Promise.resolve({ data: [] as any[] }),
          professionalIds.length
            ? supabase.from("professional_products" as any).select("id,name" as any).in("id" as any, professionalIds as any)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const partnerNames = new Map(((partnerProductsRes.data as any[]) || []).map((p) => [p.id, p.name]));
        const professionalNames = new Map(((professionalProductsRes.data as any[]) || []).map((p) => [p.id, p.name]));

        orders.forEach((o: any) => {
          const isPartner = !!o.partner_product_id;
          const rawId = o.partner_product_id || o.professional_product_id;
          if (!rawId) return;
          const productId = `${isPartner ? "partner" : "professional"}:${rawId}`;
          const existing = map.get(productId) || { product_id: productId, qty: 0, revenue: 0 };
          existing.qty += 1;
          existing.revenue += Number(o.gross_amount) || 0;
          map.set(productId, existing);
          extraProducts.push({
            id: productId,
            name: isPartner ? (partnerNames.get(rawId) || "Produto de parceiro") : (professionalNames.get(rawId) || "Produto profissional"),
            category_id: isPartner ? "__partner_products" : "__professional_products",
            section_id: isPartner ? "__partner_store" : "__professional_store",
          });
        });
      }

      if (!cancelled) {
        setSales(map);
        setAllProducts((base) => {
          const regular = base.filter((p) => !p.id.startsWith("partner:") && !p.id.startsWith("professional:"));
          const byId = new Map([...regular, ...extraProducts].map((p) => [p.id, p]));
          return Array.from(byId.values());
        });
        setAllSections((base) => {
          const regular = base.filter((s) => !s.id.startsWith("__partner") && !s.id.startsWith("__professional"));
          return [
            ...regular,
            { id: "__partner_store", name: "Parceiros da loja" },
            { id: "__professional_store", name: "Profissionais da loja" },
          ];
        });
        setAllCategories((base) => {
          const regular = base.filter((c) => !c.id.startsWith("__partner") && !c.id.startsWith("__professional"));
          return [
            ...regular,
            { id: "__partner_products", name: "Produtos de parceiros", section_id: "__partner_store" },
            { id: "__professional_products", name: "Produtos profissionais", section_id: "__professional_store" },
          ];
        });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [coachProfileId, period, customFrom, customTo]);

  const tree: SectionNode[] = useMemo(() => {
    const limit = limitMode === "all" ? Infinity : limitMode;
    const catMap = new Map(allCategories.map((c) => [c.id, c]));
    const secMap = new Map<string, SectionNode>(
      allSections.map((s) => [s.id, { id: s.id, name: s.name, qty: 0, revenue: 0, rank: 0, categories: [] }])
    );
    const ensureSec = (id: string | null, name: string) => {
      const key = id || "__none__";
      if (!secMap.has(key)) secMap.set(key, { id: key, name, qty: 0, revenue: 0, rank: 0, categories: [] });
      return secMap.get(key)!;
    };

    // Helper to fetch-or-create a category node inside a section bucket
    const catNodesBySec = new Map<string, Map<string, CategoryNode>>();
    const ensureCatInSec = (sec: SectionNode, catId: string, catName: string): CategoryNode => {
      let bucket = catNodesBySec.get(sec.id);
      if (!bucket) { bucket = new Map(); catNodesBySec.set(sec.id, bucket); }
      let node = bucket.get(catId);
      if (!node) {
        node = { id: catId, name: catName, qty: 0, revenue: 0, rank: 0, products: [] };
        bucket.set(catId, node);
        sec.categories.push(node);
      }
      return node;
    };

    // Initialize known categories under their parent sections (empty buckets)
    allCategories.forEach((c) => {
      const sec = ensureSec(c.section_id, "Sem seção");
      ensureCatInSec(sec, c.id, c.name);
    });

    // Place each product under its proper section + category (or "Geral" subcategory)
    allProducts.forEach((p) => {
      const sale = sales.get(p.id);
      const node: ProductNode = {
        id: p.id, name: p.name, qty: sale?.qty || 0, revenue: sale?.revenue || 0, rank: 0,
      };
      // Resolve section: prefer product.section_id; fallback to its category's section
      const catMeta = p.category_id ? catMap.get(p.category_id) : undefined;
      const sectionId = p.section_id || catMeta?.section_id || null;
      const sec = ensureSec(sectionId, "Sem seção");
      // Resolve category: use product.category_id if present, otherwise a "Geral" pseudo-category per section
      const catId = p.category_id || `__general_${sec.id}`;
      const catName = catMeta?.name || "Geral";
      const cat = ensureCatInSec(sec, catId, catName);
      cat.products.push(node);
    });

    const arr = Array.from(secMap.values()).filter((s) => s.categories.length > 0);
    arr.forEach((s) => {
      s.categories = s.categories.filter((c) => c.products.length > 0);
      s.categories.forEach((c) => {
        c.qty = c.products.reduce((sum, p) => sum + p.qty, 0);
        c.revenue = c.products.reduce((sum, p) => sum + p.revenue, 0);
      });
      s.qty = s.categories.reduce((acc, c) => acc + c.qty, 0);
      s.revenue = s.categories.reduce((acc, c) => acc + c.revenue, 0);
      s.categories.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name));
      s.categories = s.categories.slice(0, limit).map((c, i) => ({ ...c, rank: i + 1 }));
      s.categories.forEach((c) => {
        c.products.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name));
        c.products = c.products.slice(0, limit).map((p, i) => ({ ...p, rank: i + 1 }));
      });
    });
    arr.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name));
    return arr.filter((s) => s.categories.length > 0).map((s, i) => ({ ...s, rank: i + 1 }));
  }, [sales, allProducts, allCategories, allSections, limitMode]);

  const totalQty = useMemo(() => tree.reduce((s, n) => s + n.qty, 0), [tree]);
  const totalRevenue = useMemo(() => tree.reduce((s, n) => s + n.revenue, 0), [tree]);

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
        <div className="flex gap-2 text-right">
          <div className="rounded-xl bg-primary/15 px-3 py-2">
            <p className="text-[10px] uppercase text-primary/80">Qtd vendida</p>
            <p className="text-xl font-bold text-primary">{totalQty}</p>
          </div>
          <div className="rounded-xl bg-emerald-500/15 px-3 py-2">
            <p className="text-[10px] uppercase text-emerald-400/80">Receita</p>
            <p className="text-base font-bold text-emerald-400">{money(totalRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Calendar className="ml-2 h-3.5 w-3.5 text-white/40" />
          {([
            { k: "all", label: "Todo o período" },
            { k: "month", label: "Mês atual" },
            { k: "30d", label: "Últimos 30 dias" },
            { k: "custom", label: "Personalizado" },
          ] as Array<{ k: PeriodKey; label: string }>).map((opt) => (
            <button
              key={opt.k}
              onClick={() => setPeriod(opt.k)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${period === opt.k ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white" />
            <span className="text-xs text-white/40">até</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white" />
          </div>
        )}

        <div className="ml-auto inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
          {([10, 20, "all"] as const).map((m) => (
            <button
              key={String(m)}
              onClick={() => setLimitMode(m)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${limitMode === m ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}
            >
              {m === "all" ? "Ver todos" : `Top ${m}`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl p-8 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="mt-2 text-sm text-white/50">Calculando suas conquistas...</p>
        </div>
      ) : tree.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
          <Package className="mx-auto h-8 w-8 text-white/30" />
          <p className="mt-2 text-sm text-white/50">Nenhuma categoria cadastrada ainda.</p>
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
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">{money(sec.revenue)}</span>
                    <span className="rounded-full bg-primary/20 px-3 py-1 text-sm font-bold text-primary">{sec.qty}</span>
                  </div>
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
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400/90">{money(cat.revenue)}</span>
                              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-white/80">{cat.qty}</span>
                            </div>
                          </button>
                          {catOpen && (
                            <div className="space-y-1 border-t border-white/5 p-2">
                              {cat.products.length === 0 ? (
                                <p className="px-3 py-2 text-[11px] text-white/40">Nenhum produto cadastrado nesta subcategoria.</p>
                              ) : cat.products.map((p) => (
                                <div key={p.id} className="flex items-center justify-between gap-3 rounded-md px-3 py-2" style={{ backgroundColor: "#0B0B0B" }}>
                                  <div className="flex items-center gap-2">
                                    <RankBadge rank={p.rank} />
                                    <Package className="h-3 w-3 text-white/40" />
                                    <span className="text-xs text-white/80">{p.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400/90">{money(p.revenue)}</span>
                                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">{p.qty}</span>
                                  </div>
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
