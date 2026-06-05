import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, ShoppingBag, Users, Ticket, TrendingUp, Loader2, CalendarDays, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { getPartnerReports, type PartnerReport } from "@/lib/partner-reports.functions";

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Tab = "resumo" | "vendas" | "cupons" | "coaches" | "visitas";

export function PartnerReports() {
  const fetchReport = useServerFn(getPartnerReports);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<PartnerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("resumo");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchReport({ data: { from, to } });
      setData(res);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const summary = data?.summary;

  const exportXlsx = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([data.summary]), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.by_product), "Vendas por Produto");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.by_category), "Vendas por Categoria");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.top_coaches), "Top Coaches");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.coupons_recent), "Cupons");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.recent_visits), "Visitas");
    XLSX.writeFile(wb, `relatorio-parceiro-${from}-a-${to}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white">Relatórios</h2>
          <p className="text-xs text-white/50">Dashboards interativos da sua operação</p>
        </div>
        <button onClick={exportXlsx} disabled={!data} className="rounded bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> Exportar Excel
        </button>
      </div>

      <div className="rounded-xl p-3 flex flex-wrap items-end gap-2" style={{ backgroundColor: "#1A1A1A" }}>
        <div>
          <label className="block text-[10px] text-white/50 mb-1">De</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white" />
        </div>
        <div>
          <label className="block text-[10px] text-white/50 mb-1">Até</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white" />
        </div>
        <button onClick={load} disabled={loading} className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {loading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Aplicar"}
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <Tb active={tab === "resumo"} onClick={() => setTab("resumo")} icon={BarChart3} label="Resumo" />
        <Tb active={tab === "vendas"} onClick={() => setTab("vendas")} icon={ShoppingBag} label="Vendas" />
        <Tb active={tab === "cupons"} onClick={() => setTab("cupons")} icon={Ticket} label="Cupons" />
        <Tb active={tab === "coaches"} onClick={() => setTab("coaches")} icon={TrendingUp} label="Top Coaches" />
        <Tb active={tab === "visitas"} onClick={() => setTab("visitas")} icon={Users} label="Visitas" />
      </div>

      {loading || !data || !summary ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {tab === "resumo" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Visitas" value={summary.visits.toString()} sub={`${summary.unique_visitors} únicos`} />
              <Kpi label="Visitas via coach" value={summary.visits_via_coach.toString()} sub={`${summary.visits === 0 ? 0 : Math.round((summary.visits_via_coach / summary.visits) * 100)}% do total`} />
              <Kpi label="Vendas pagas" value={summary.paid_orders.toString()} sub={brl(summary.revenue_gross) + " bruto"} />
              <Kpi label="Receita líquida" value={brl(summary.revenue_net)} sub="seu net no período" highlight />
              <Kpi label="Cupons gerados" value={summary.coupons_generated.toString()} sub={`${summary.coupons_used} usados`} />
              <Kpi label="Conversão de cupons" value={`${summary.coupon_conversion_pct.toFixed(1)}%`} sub="usados / gerados" />
              <Kpi label="Gratuitos resgatados" value={summary.freebies_redeemed.toString()} sub="—" />
              <Kpi label="Período" value={`${data.range.from}`} sub={`até ${data.range.to}`} small />
            </div>
          )}

          {tab === "vendas" && (
            <div className="space-y-4">
              <Section title="Por produto">
                {data.by_product.length === 0 ? <Empty msg="Sem vendas no período." /> : (
                  <Table cols={["Produto", "Tipo", "Qtd", "Receita"]}>
                    {data.by_product.map((p) => (
                      <tr key={p.product_id} className="border-t border-white/5">
                        <td className="py-1.5 px-2">{p.product_name}</td>
                        <td className="py-1.5 px-2 text-xs">{p.kind === "free" ? "Desconto" : "Patrocinado"}</td>
                        <td className="py-1.5 px-2 text-right">{p.qty}</td>
                        <td className="py-1.5 px-2 text-right">{brl(p.revenue)}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Section>
              <Section title="Por categoria">
                {data.by_category.length === 0 ? <Empty msg="—" /> : (
                  <Table cols={["Categoria", "Qtd", "Receita"]}>
                    {data.by_category.map((c) => (
                      <tr key={c.category_id || c.category_name} className="border-t border-white/5">
                        <td className="py-1.5 px-2">{c.category_name}</td>
                        <td className="py-1.5 px-2 text-right">{c.qty}</td>
                        <td className="py-1.5 px-2 text-right">{brl(c.revenue)}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Section>
            </div>
          )}

          {tab === "cupons" && (
            <Section title={`Cupons (${summary.coupons_generated} gerados • ${summary.coupons_used} usados)`}>
              {data.coupons_recent.length === 0 ? <Empty msg="Nenhum cupom no período." /> : (
                <Table cols={["Data", "Aluno", "Produto", "Token", "Status", "Usado em"]}>
                  {data.coupons_recent.map((c) => (
                    <tr key={c.id} className="border-t border-white/5">
                      <td className="py-1.5 px-2 text-xs">{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="py-1.5 px-2">{c.student_name}</td>
                      <td className="py-1.5 px-2 text-xs">{c.product_name || "—"}</td>
                      <td className="py-1.5 px-2 text-[10px] font-mono">{c.token}</td>
                      <td className="py-1.5 px-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded ${c.status === "used" ? "bg-green-500/20 text-green-400" : c.status === "active" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>{c.status}</span>
                      </td>
                      <td className="py-1.5 px-2 text-xs">{c.redeemed_at ? new Date(c.redeemed_at).toLocaleString("pt-BR") : "—"}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          )}

          {tab === "coaches" && (
            <Section title="Coaches mais influentes">
              {data.top_coaches.length === 0 ? <Empty msg="Nenhum coach trouxe alunos no período." /> : (
                <Table cols={["#", "Coach", "Visitas", "Compradores", "Receita"]}>
                  {data.top_coaches.map((c, i) => (
                    <tr key={c.coach_id} className="border-t border-white/5">
                      <td className="py-1.5 px-2 text-white/50 text-xs">{i + 1}</td>
                      <td className="py-1.5 px-2 font-medium">{c.coach_name}</td>
                      <td className="py-1.5 px-2 text-right">{c.visits}</td>
                      <td className="py-1.5 px-2 text-right">{c.buyers}</td>
                      <td className="py-1.5 px-2 text-right">{brl(c.revenue)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          )}

          {tab === "visitas" && (
            <Section title={`Visitas recentes (${summary.visits} no período)`}>
              {data.recent_visits.length === 0 ? <Empty msg="Sem visitas." /> : (
                <Table cols={["Data", "Aluno", "Coach"]}>
                  {data.recent_visits.map((v) => (
                    <tr key={v.id} className="border-t border-white/5">
                      <td className="py-1.5 px-2 text-xs">{new Date(v.visited_at).toLocaleString("pt-BR")}</td>
                      <td className="py-1.5 px-2 flex items-center gap-2">
                        {v.student_photo ? <img src={v.student_photo} className="h-6 w-6 rounded-full object-cover" alt="" /> : <div className="h-6 w-6 rounded-full bg-primary/20" />}
                        {v.student_name}
                      </td>
                      <td className="py-1.5 px-2 text-xs text-white/70">{v.coach_name || "—"}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Tb({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof BarChart3; label: string }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${active ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function Kpi({ label, value, sub, highlight, small }: { label: string; value: string; sub?: string; highlight?: boolean; small?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "border border-primary/40" : ""}`} style={{ backgroundColor: "#1A1A1A" }}>
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`mt-1 font-bold text-white ${small ? "text-sm" : "text-2xl"}`}>{value}</p>
      {sub && <p className="text-[10px] text-white/40 mt-0.5">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
      <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-center text-xs text-white/40 py-6">{msg}</p>;
}

function Table({ cols, children }: { cols: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-white/90">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-white/40">
            {cols.map((c) => <th key={c} className="text-left px-2 py-1.5 font-semibold">{c}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
