import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp, Package, Gift, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/store-reports")({
  head: () => ({ meta: [{ title: "Relatórios da Loja — Admin" }] }),
  component: StoreReports,
});

type OrderItem = {
  id: string;
  title: string;
  quantity: number;
  total_price: number;
  product_kind: string;
  store_item_id: string | null;
  store_items: { name: string; section_id: string | null; store_sections: { name: string } | null } | null;
  store_orders: { status: string; created_at: string } | null;
};

type LowStockItem = { id: string; name: string; stock: number };

function StoreReports() {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [redemptions, setRedemptions] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [a, b, c] = await Promise.all([
      supabase.from("store_order_items" as never)
        .select("id,title,quantity,total_price,product_kind,store_item_id,store_items(name,section_id,store_sections(name)),store_orders!inner(status,created_at)" as never)
        .gte("store_orders.created_at" as never, since)
        .in("store_orders.status" as never, ["paid", "preparing", "shipped", "delivered"] as never),
      supabase.from("store_items" as never).select("id,name,stock").eq("kind" as never, "physical").not("stock" as never, "is", null).lte("stock" as never, 5).order("stock" as never),
      supabase.from("freebie_redemptions" as never).select("freebies(name)" as never).gte("created_at" as never, since).neq("status" as never, "cancelled"),
    ]);
    setItems((a.data as unknown as OrderItem[]) || []);
    setLowStock((b.data as unknown as LowStockItem[]) || []);
    const counts: Record<string, number> = {};
    ((c.data as unknown as { freebies: { name: string } | null }[]) || []).forEach((r) => {
      const n = r.freebies?.name || "—"; counts[n] = (counts[n] || 0) + 1;
    });
    setRedemptions(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));
    setLoading(false);
  };

  useEffect(() => { load(); }, [days]);

  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const bySection = useMemo(() => {
    const map = new Map<string, { revenue: number; qty: number }>();
    items.forEach((i) => {
      const sec = i.store_items?.store_sections?.name || "Outros";
      const cur = map.get(sec) || { revenue: 0, qty: 0 };
      cur.revenue += Number(i.total_price); cur.qty += i.quantity;
      map.set(sec, cur);
    });
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);
  }, [items]);

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    items.forEach((i) => {
      const key = i.store_item_id || i.title;
      const cur = map.get(key) || { name: i.store_items?.name || i.title, qty: 0, revenue: 0 };
      cur.qty += i.quantity; cur.revenue += Number(i.total_price);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 15);
  }, [items]);

  const totalRev = items.reduce((s, i) => s + Number(i.total_price), 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><TrendingUp className="h-6 w-6 text-primary" /> Relatórios da Loja</h1>
          <p className="text-sm text-white/50">Receita por seção, top itens, estoque baixo e gratuitos</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded bg-black/40 border border-white/10 px-3 py-1.5 text-xs text-white">
          <option value={7}>7 dias</option>
          <option value={30}>30 dias</option>
          <option value={90}>90 dias</option>
          <option value={365}>1 ano</option>
        </select>
      </div>

      {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /> : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            <Card label="Receita" value={fmt(totalRev)} icon={TrendingUp} />
            <Card label="Itens vendidos" value={String(totalQty)} icon={Package} />
            <Card label="Estoque baixo" value={String(lowStock.length)} icon={AlertTriangle} />
            <Card label="Resgates grátis" value={String(redemptions.reduce((s, r) => s + r.count, 0))} icon={Gift} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Receita por seção">
              {bySection.length === 0 ? <Empty /> : bySection.map((s) => {
                const max = Math.max(1, ...bySection.map((x) => x.revenue));
                return (
                  <div key={s.name} className="mb-2">
                    <div className="flex justify-between text-xs"><span className="text-white">{s.name}</span><span className="text-primary font-bold">{fmt(s.revenue)}</span></div>
                    <div className="h-2 bg-white/5 rounded mt-1"><div className="h-full bg-primary rounded" style={{ width: `${(s.revenue / max) * 100}%` }} /></div>
                    <p className="text-[10px] text-white/40 mt-0.5">{s.qty} unidades</p>
                  </div>
                );
              })}
            </Section>

            <Section title="Top itens vendidos">
              {topItems.length === 0 ? <Empty /> : (
                <div className="space-y-1.5">
                  {topItems.map((i, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded bg-white/5 px-3 py-2 text-xs">
                      <span className="text-white truncate flex-1">{i.name}</span>
                      <span className="text-white/60 mx-2">{i.qty}x</span>
                      <span className="text-primary font-bold">{fmt(i.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Estoque baixo (≤ 5)">
              {lowStock.length === 0 ? <p className="text-sm text-white/50">Tudo certo.</p> : (
                <div className="space-y-1.5">
                  {lowStock.map((i) => (
                    <div key={i.id} className="flex items-center justify-between rounded bg-white/5 px-3 py-2 text-xs">
                      <span className="text-white">{i.name}</span>
                      <span className={`px-2 py-0.5 rounded ${i.stock === 0 ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>{i.stock}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Top brindes resgatados">
              {redemptions.length === 0 ? <Empty /> : (
                <div className="space-y-1.5">
                  {redemptions.slice(0, 10).map((r) => (
                    <div key={r.name} className="flex items-center justify-between rounded bg-white/5 px-3 py-2 text-xs">
                      <span className="text-white">{r.name}</span>
                      <span className="text-primary font-bold">{r.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </>
      )}
    </>
  );
}

function Card({ label, value, icon: Icon }: { label: string; value: string; icon: typeof TrendingUp }) {
  return (
    <div className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center justify-between"><p className="text-xs text-white/50">{label}</p><Icon className="h-5 w-5 text-primary" /></div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}><h2 className="mb-3 font-bold text-white">{title}</h2>{children}</section>;
}
function Empty() { return <p className="text-sm text-white/50">Sem dados no período.</p>; }
