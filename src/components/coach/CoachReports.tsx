import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarCheck, BarChart3, User as UserIcon, ShoppingBag, Trophy, Users,
  Download, Search, TrendingUp, TrendingDown, Network,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  getCoachAttendanceHistory,
  type AttendanceHistory,
} from "@/server/google-calendar.functions";
import {
  getCoachSalesReport, getCoachChallengeRanking,
  type SalesReport, type ChallengeRankingRow,
} from "@/lib/coach-reports.functions";
import { getCoachDownlineReport, type DownlineReport } from "@/lib/coach-downline.functions";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function thisMonthISO() { return new Date().toISOString().slice(0, 7); }
function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function shiftMonths(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00"); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10);
}
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100);

type ReportTab = "atendimentos" | "vendas" | "clientes" | "desafio";

export function CoachReports() {
  const [tab, setTab] = useState<ReportTab>("vendas");

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Relatórios</h1>
          <p className="text-sm text-white/50">Dashboards interativos com dados em tempo real</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <TabBtn active={tab === "vendas"} onClick={() => setTab("vendas")} icon={ShoppingBag} label="Vendas" />
          <TabBtn active={tab === "clientes"} onClick={() => setTab("clientes")} icon={Users} label="Top Clientes" />
          <TabBtn active={tab === "desafio"} onClick={() => setTab("desafio")} icon={Trophy} label="Desafio" />
          <TabBtn active={tab === "atendimentos"} onClick={() => setTab("atendimentos")} icon={CalendarCheck} label="Atendimentos" />
        </div>
      </div>

      {tab === "vendas" && <SalesDashboard mode="sales" />}
      {tab === "clientes" && <SalesDashboard mode="customers" />}
      {tab === "desafio" && <ChallengeDashboard />}
      {tab === "atendimentos" && <AttendanceDashboard />}
    </>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof BarChart3; label: string }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${active ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

/* ------------------- Sales / Customers Dashboard ------------------- */

function SalesDashboard({ mode }: { mode: "sales" | "customers" }) {
  const fetchSales = useServerFn(getCoachSalesReport);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [compare, setCompare] = useState(true);
  const [compareFrom, setCompareFrom] = useState(shiftMonths(firstOfMonth(), -1));
  const [compareTo, setCompareTo] = useState(shiftMonths(todayISO(), -1));
  const [search, setSearch] = useState("");
  const [data, setData] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchSales({ data: { from, to, compareFrom: compare ? compareFrom : undefined, compareTo: compare ? compareTo : undefined } })
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [fetchSales, from, to, compare, compareFrom, compareTo]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter((r) =>
      r.student_name.toLowerCase().includes(q) ||
      r.student_email.toLowerCase().includes(q) ||
      r.product_name.toLowerCase().includes(q),
    );
  }, [data, search]);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return q ? data.byProduct.filter((p) => p.name.toLowerCase().includes(q)) : data.byProduct;
  }, [data, search]);

  const filteredCustomers = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return q ? data.byCustomer.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) : data.byCustomer;
  }, [data, search]);

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Métrica: "Receita", Valor: data.totals.revenue },
      { Métrica: "Pedidos", Valor: data.totals.orders },
      { Métrica: "Itens vendidos", Valor: data.totals.itemsSold },
      { Métrica: "Clientes únicos", Valor: data.totals.uniqueCustomers },
      { Métrica: "Período", Valor: `${data.range.from} a ${data.range.to}` },
    ]), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byMonth.map((m) => ({ Mês: m.month, Receita: m.revenue, Pedidos: m.orders }))), "Por mês");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredProducts.map((p) => ({ Produto: p.name, Quantidade: p.quantity, Receita: p.revenue }))), "Top produtos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredCustomers.map((c) => ({ Cliente: c.name, Email: c.email, Pedidos: c.orders, "Total gasto": c.revenue }))), "Top clientes");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredRows.map((r) => ({
      Data: r.paid_at.slice(0, 10), Cliente: r.student_name, Email: r.student_email,
      Produto: r.product_name, Quantidade: r.quantity, Valor: r.amount, Origem: r.source,
    }))), "Detalhado");
    XLSX.writeFile(wb, `relatorio-vendas-${data.range.from}-${data.range.to}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex flex-wrap items-center gap-2">
          <Label>Período:</Label>
          <DateInput value={from} onChange={setFrom} />
          <span className="text-white/40 text-xs">até</span>
          <DateInput value={to} onChange={setTo} />
          <QuickRange label="Mês atual" onClick={() => { setFrom(firstOfMonth()); setTo(todayISO()); }} />
          <QuickRange label="30 dias" onClick={() => { setFrom(shiftMonths(todayISO(), -1)); setTo(todayISO()); }} />
          <QuickRange label="90 dias" onClick={() => { setFrom(shiftMonths(todayISO(), -3)); setTo(todayISO()); }} />
          <QuickRange label="1 ano" onClick={() => { setFrom(shiftMonths(todayISO(), -12)); setTo(todayISO()); }} />
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-white/60 flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Comparar
            </label>
            <button onClick={exportExcel} className="bg-primary/15 text-primary px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/25 flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
          </div>
        </div>
        {compare && (
          <div className="flex flex-wrap items-center gap-2">
            <Label>Comparar com:</Label>
            <DateInput value={compareFrom} onChange={setCompareFrom} />
            <span className="text-white/40 text-xs">até</span>
            <DateInput value={compareTo} onChange={setCompareTo} />
            <QuickRange label="Mês anterior" onClick={() => { setCompareFrom(shiftMonths(from, -1)); setCompareTo(shiftMonths(to, -1)); }} />
            <QuickRange label="Ano anterior" onClick={() => { setCompareFrom(shiftMonths(from, -12)); setCompareTo(shiftMonths(to, -12)); }} />
          </div>
        )}
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto, cliente ou email..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white" />
        </div>
      </div>

      {loading && <p className="text-xs text-white/50">Carregando dados...</p>}

      {!loading && data && (
        <>
          {/* KPIs */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi label="Receita" value={brl(data.totals.revenue)} delta={data.compare ? pct(data.totals.revenue, data.compare.totals.revenue) : null} />
            <Kpi label="Pedidos" value={String(data.totals.orders)} delta={data.compare ? pct(data.totals.orders, data.compare.totals.orders) : null} />
            <Kpi label="Itens vendidos" value={String(data.totals.itemsSold)} delta={data.compare ? pct(data.totals.itemsSold, data.compare.totals.itemsSold) : null} />
            <Kpi label="Clientes únicos" value={String(data.totals.uniqueCustomers)} delta={data.compare ? pct(data.totals.uniqueCustomers, data.compare.totals.uniqueCustomers) : null} />
          </div>

          {/* Monthly comparison chart */}
          <Section title="Receita por mês">
            <MonthlyBars main={data.byMonth} compare={data.compare?.byMonth} />
          </Section>

          {mode === "sales" ? (
            <>
              <Section title={`Top produtos (${filteredProducts.length})`}>
                <RankList items={filteredProducts.slice(0, 20).map((p) => ({
                  key: p.product_id || p.name,
                  label: p.name,
                  meta: `${p.quantity} un.`,
                  value: brl(p.revenue),
                  ratio: filteredProducts[0] ? p.revenue / filteredProducts[0].revenue : 0,
                }))} />
              </Section>
              <Section title={`Vendas detalhadas (${filteredRows.length})`}>
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="text-white/50 text-left sticky top-0 bg-[#1A1A1A]">
                      <tr><th className="py-2 pr-3">Data</th><th className="pr-3">Cliente</th><th className="pr-3">Produto</th><th className="pr-3 text-right">Qtd</th><th className="text-right">Valor</th></tr>
                    </thead>
                    <tbody>
                      {filteredRows.slice(0, 200).map((r) => (
                        <tr key={r.id + r.source} className="border-t border-white/5">
                          <td className="py-2 pr-3 text-white/60">{new Date(r.paid_at).toLocaleDateString("pt-BR")}</td>
                          <td className="pr-3 text-white">{r.student_name}</td>
                          <td className="pr-3 text-white/80 truncate max-w-xs">{r.product_name}</td>
                          <td className="pr-3 text-right text-white/70">{r.quantity}</td>
                          <td className="text-right text-primary font-bold">{brl(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </>
          ) : (
            <Section title={`Clientes que mais compram (${filteredCustomers.length})`}>
              <RankList items={filteredCustomers.slice(0, 30).map((c) => ({
                key: c.student_id,
                label: c.name,
                meta: `${c.email} · ${c.orders} pedido(s)`,
                value: brl(c.revenue),
                ratio: filteredCustomers[0] ? c.revenue / filteredCustomers[0].revenue : 0,
              }))} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------- Challenge Dashboard ------------------- */

function ChallengeDashboard() {
  const fetchChallenge = useServerFn(getCoachChallengeRanking);
  const [from, setFrom] = useState(shiftMonths(todayISO(), -12));
  const [to, setTo] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ChallengeRankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchChallenge({ data: { from, to } })
      .then(setData).catch(() => setData([])).finally(() => setLoading(false));
  }, [fetchChallenge, from, to]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? data.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) : data;
  }, [data, search]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtered.map((r, i) => ({
      "#": i + 1, Cliente: r.name, Email: r.email,
      "Peso inicial (kg)": r.initial_weight, "Peso final (kg)": r.final_weight,
      "Perda (kg)": r.result_kg, "Perda (%)": r.result_pct,
      "Data final": r.final_date,
    }))), "Desafio");
    XLSX.writeFile(wb, `desafio-${from}-${to}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex flex-wrap items-center gap-2">
          <Label>Período:</Label>
          <DateInput value={from} onChange={setFrom} />
          <span className="text-white/40 text-xs">até</span>
          <DateInput value={to} onChange={setTo} />
          <div className="ml-auto flex gap-2">
            <button onClick={exportExcel} className="bg-primary/15 text-primary px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/25 flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white" />
        </div>
      </div>

      {loading && <p className="text-xs text-white/50">Carregando ranking...</p>}

      {!loading && (
        <Section title={`Melhores classificados no desafio (${filtered.length})`}>
          {filtered.length === 0 ? <p className="text-sm text-white/50">Nenhum participante no período.</p> : (
            <div className="space-y-1.5">
              {filtered.slice(0, 50).map((r, i) => (
                <div key={r.student_id + i} className="flex items-center gap-3 rounded bg-white/5 px-3 py-2">
                  <span className={`w-7 text-center text-xs font-bold ${i < 3 ? "text-primary" : "text-white/40"}`}>#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{r.name}</p>
                    <p className="text-[10px] text-white/40">
                      {r.initial_weight ?? "—"}kg → {r.final_weight ?? "—"}kg
                      {r.final_date ? ` · ${new Date(r.final_date).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">{r.result_pct != null ? `${r.result_pct}%` : "—"}</p>
                    <p className="text-[10px] text-white/40">{r.result_kg != null ? `${r.result_kg} kg` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

/* ------------------- Attendance (existing) ------------------- */

function AttendanceDashboard() {
  const [view, setView] = useState<"daily" | "monthly">("daily");
  const [day, setDay] = useState(todayISO());
  const [month, setMonth] = useState(thisMonthISO());
  const [data, setData] = useState<AttendanceHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCoachAttendanceHistory({ data: { day, month } })
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [day, month]);

  const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const maxPerDay = Math.max(1, ...(data?.monthly.perDay.map((d) => d.total) ?? [0]));

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setView("daily")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${view === "daily" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}>
          <CalendarCheck className="h-3.5 w-3.5 inline mr-1" /> Diário
        </button>
        <button onClick={() => setView("monthly")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${view === "monthly" ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}>
          <BarChart3 className="h-3.5 w-3.5 inline mr-1" /> Mensal
        </button>
        <div className="ml-auto">
          {view === "daily"
            ? <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 text-xs text-white" />
            : <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 text-xs text-white" />}
        </div>
      </div>
      {loading && <p className="text-xs text-white/50">Carregando...</p>}
      {!loading && data && view === "daily" && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">{fmtDate(data.daily.date)}</h3>
            <span className="text-2xl font-bold text-primary">{data.daily.total}</span>
          </div>
          {data.daily.items.length === 0 ? <p className="text-sm text-white/50">Nenhum atendimento concluído neste dia.</p> : (
            <ul className="space-y-2">
              {data.daily.items.map((it) => (
                <li key={it.id} className="rounded-xl p-3 bg-black/30 border border-white/5">
                  <p className="text-sm font-semibold text-white">{it.summary}</p>
                  <p className="text-[11px] text-white/60 mt-0.5">{fmtTime(it.start)}</p>
                  {it.attendee && <p className="text-[11px] text-white/50 mt-1 flex items-center gap-1"><UserIcon className="h-3 w-3" /> {it.attendee}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!loading && data && view === "monthly" && (
        <div className="space-y-4">
          <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-white">Total no mês</h3>
              <span className="text-3xl font-bold text-primary">{data.monthly.total}</span>
            </div>
            <p className="text-xs text-white/50">{data.monthly.month}</p>
          </div>
          <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
            <h3 className="text-sm font-bold text-white mb-4">Evolução diária</h3>
            {data.monthly.perDay.length === 0 ? <p className="text-sm text-white/50">Sem dados neste mês.</p> : (
              <div className="space-y-1.5">
                {data.monthly.perDay.map((d) => (
                  <div key={d.date} className="flex items-center gap-3">
                    <span className="text-[11px] text-white/60 w-16 shrink-0">{fmtDate(d.date)}</span>
                    <div className="flex-1 h-5 bg-white/5 rounded"><div className="h-full rounded bg-primary" style={{ width: `${(d.total / maxPerDay) * 100}%` }} /></div>
                    <span className="text-xs font-bold text-white w-8 text-right">{d.total}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------- Shared UI ------------------- */

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-white/60 font-semibold">{children}</span>;
}
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5 text-xs text-white" />;
}
function QuickRange({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="bg-white/5 hover:bg-white/10 text-white/70 px-2.5 py-1.5 rounded-lg text-[11px]">{label}</button>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
      <h3 className="text-sm font-bold text-white mb-3">{title}</h3>
      {children}
    </section>
  );
}
function Kpi({ label, value, delta }: { label: string; value: string; delta: number | null }) {
  const up = delta != null && delta >= 0;
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
      <p className="text-xs text-white/50">{label}</p>
      <p className="text-2xl font-bold text-white mt-1 font-mono">{value}</p>
      {delta != null && (
        <p className={`text-[11px] mt-1 flex items-center gap-1 ${up ? "text-green-400" : "text-red-400"}`}>
          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta > 0 ? "+" : ""}{delta.toFixed(1)}% vs período anterior
        </p>
      )}
    </div>
  );
}
function MonthlyBars({ main, compare }: { main: { month: string; revenue: number; orders: number }[]; compare?: { month: string; revenue: number; orders: number }[] }) {
  const all = [...main, ...(compare || [])];
  const max = Math.max(1, ...all.map((m) => m.revenue));
  if (main.length === 0) return <p className="text-sm text-white/50">Sem dados no período.</p>;
  const best = main.reduce((a, b) => (b.revenue > a.revenue ? b : a), main[0]);
  const worst = main.reduce((a, b) => (b.revenue < a.revenue ? b : a), main[0]);
  return (
    <>
      <div className="space-y-2">
        {main.map((m) => {
          const cmp = compare?.find((c) => c.month.slice(5) === m.month.slice(5));
          const isBest = m.month === best.month && main.length > 1;
          const isWorst = m.month === worst.month && main.length > 1;
          return (
            <div key={m.month}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-white font-semibold">{m.month}{isBest && " 🏆"}{isWorst && " ⬇"}</span>
                <span className="text-primary font-bold font-mono">{brl(m.revenue)}</span>
              </div>
              <div className="h-3 bg-white/5 rounded overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${(m.revenue / max) * 100}%` }} />
              </div>
              {cmp && (
                <div className="h-2 bg-white/5 rounded overflow-hidden mt-0.5">
                  <div className="h-full bg-white/30" style={{ width: `${(cmp.revenue / max) * 100}%` }} />
                </div>
              )}
              <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
                <span>{m.orders} pedidos</span>
                {cmp && <span>Comp.: {brl(cmp.revenue)} ({cmp.orders} ped.)</span>}
              </div>
            </div>
          );
        })}
      </div>
      {main.length > 1 && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2.5">
            <p className="text-green-400 font-semibold">Melhor mês: {best.month}</p>
            <p className="text-white/70 font-mono">{brl(best.revenue)}</p>
          </div>
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5">
            <p className="text-red-400 font-semibold">Pior mês: {worst.month}</p>
            <p className="text-white/70 font-mono">{brl(worst.revenue)}</p>
          </div>
        </div>
      )}
    </>
  );
}
function RankList({ items }: { items: { key: string; label: string; meta: string; value: string; ratio: number }[] }) {
  if (items.length === 0) return <p className="text-sm text-white/50">Sem resultados.</p>;
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={it.key + i} className="rounded bg-white/5 px-3 py-2">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-6 text-center text-xs font-bold ${i < 3 ? "text-primary" : "text-white/40"}`}>#{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{it.label}</p>
                <p className="text-[10px] text-white/40 truncate">{it.meta}</p>
              </div>
            </div>
            <span className="text-sm font-bold text-primary font-mono shrink-0">{it.value}</span>
          </div>
          <div className="h-1 bg-white/5 rounded"><div className="h-full bg-primary rounded" style={{ width: `${Math.max(2, it.ratio * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
