import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BadgeDollarSign, Loader2, RefreshCcw, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import {
  deleteAdminTestSale,
  getAdminTestSalesData,
  listAdminTestSales,
  resetAdminTestSales,
  simulateAdminTestSale,
  type SimulatedSaleRow,
} from "@/lib/admin-test-sales.functions";

export const Route = createFileRoute("/admin/test-sales")({
  head: () => ({ meta: [{ title: "Testes de Vendas — Admin" }] }),
  component: AdminTestSalesPage,
});

type Option = { id: string; label: string; detail?: string | null; kind?: SaleKind; price?: number };
type SaleKind = "store" | "digital" | "challenge" | "professional" | "partner";
type SaleRow = SimulatedSaleRow;

const selectClass = "h-12 w-full rounded-lg border border-white/15 bg-black/50 px-3 text-sm font-semibold text-white outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50";
const panelClass = "rounded-2xl border border-white/10 bg-card/95 p-4 shadow-xl shadow-black/20";

const saleKindLabels: Record<SaleKind, string> = {
  store: "Coach → aluno / loja",
  digital: "Curso digital",
  challenge: "Plano/desafio",
  professional: "Profissional da saúde",
  partner: "Parceiro",
};

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function AdminTestSalesPage() {
  const loadOptions = useServerFn(getAdminTestSalesData);
  const simulate = useServerFn(simulateAdminTestSale);
  const loadSales = useServerFn(listAdminTestSales);
  const removeSale = useServerFn(deleteAdminTestSale);
  const resetSales = useServerFn(resetAdminTestSales);

  const [options, setOptions] = useState<{ students: Option[]; coaches: Option[]; products: Option[] } | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<SaleKind>("challenge");
  const [buyerStudentId, setBuyerStudentId] = useState("");
  const [sellerCoachId, setSellerCoachId] = useState("");
  const [referrerStudentId, setReferrerStudentId] = useState("");
  const [productId, setProductId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card" | "debit_card">("pix");

  const reload = async () => {
    setLoading(true);
    try {
      const [opts, rows] = await Promise.all([loadOptions(), loadSales()]);
      setOptions(opts);
      setSales(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar testes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const filteredProducts = useMemo(() => (options?.products || []).filter((p) => p.kind === kind), [kind, options?.products]);
  const selectedProduct = useMemo(() => filteredProducts.find((p) => p.id === productId) || null, [filteredProducts, productId]);

  useEffect(() => {
    if (filteredProducts.length && !filteredProducts.some((p) => p.id === productId)) setProductId(filteredProducts[0].id);
    if (!filteredProducts.length && productId) setProductId("");
  }, [filteredProducts, productId]);

  useEffect(() => {
    if (!options) return;
    if (!buyerStudentId && options.students[0]) setBuyerStudentId(options.students[0].id);
  }, [buyerStudentId, options]);

  const submit = async () => {
    if (!buyerStudentId || !productId) return toast.error("Selecione aluno e produto");
    setBusy(true);
    try {
      const result = await simulate({ data: { kind, buyerStudentId, productId, sellerCoachId: sellerCoachId || null, referrerStudentId: referrerStudentId || null, paymentMethod } });
      toast.success(`Venda simulada: ${result.orderNumber}`);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao simular venda");
    } finally {
      setBusy(false);
    }
  };

  const deleteOne = async (row: SaleRow) => {
    if (!confirm(`Excluir a simulação ${row.orderNumber}?`)) return;
    setBusy(true);
    try {
      const sourceKind = row.kind === "professional" || row.kind === "partner" ? "partner_product_order" : "store_order";
      await removeSale({ data: { sourceKind, id: row.id } });
      toast.success("Simulação excluída");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  };

  const resetAll = async () => {
    if (!confirm("Excluir todas as vendas simuladas?")) return;
    setBusy(true);
    try {
      const result = await resetSales();
      toast.success(`${result.deleted} simulação(ões) removida(s)`);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao zerar testes");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !options) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><BadgeDollarSign className="h-6 w-6 text-primary" /> Testes de Vendas</h1>
          <p className="text-sm text-white/50">Simule vendas sem checkout e acompanhe o fluxo real de comissões e carteiras.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"><RefreshCcw className="h-4 w-4" /> Atualizar</button>
          <button onClick={resetAll} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Zerar testes</button>
        </div>
      </header>

      <section className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
        <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Ambiente administrativo: a venda é marcada como paga e credita carteiras de verdade. Use “Excluir/Zerar” para remover apenas as simulações marcadas como teste.</span></div>
      </section>

      <section className={panelClass}>
        <div className="mb-4 grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 md:grid-cols-3">
          <Metric label="Alunos" value={options.students.length} />
          <Metric label="Coaches" value={options.coaches.length} />
          <Metric label="Produtos deste tipo" value={filteredProducts.length} />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Tipo de venda">
            <select value={kind} onChange={(e) => setKind(e.target.value as SaleKind)} className={selectClass}>
              {(Object.keys(saleKindLabels) as SaleKind[]).map((k) => <option key={k} value={k}>{saleKindLabels[k]}</option>)}
            </select>
          </Field>
          <Field label="Aluno comprador">
            <select value={buyerStudentId} onChange={(e) => setBuyerStudentId(e.target.value)} className={selectClass}><option value="">Selecione...</option>{options.students.map((s) => <option key={s.id} value={s.id}>{s.label} {s.detail ? `— ${s.detail}` : ""}</option>)}</select>
          </Field>
          <Field label="Produto">
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className={selectClass} disabled={filteredProducts.length === 0}><option value="">{filteredProducts.length ? "Selecione..." : "Nenhum produto neste tipo"}</option>{filteredProducts.map((p) => <option key={p.id} value={p.id}>{p.label} — {money(p.price || 0)}</option>)}</select>
          </Field>
          <Field label="Coach vendedor opcional">
            <select value={sellerCoachId} onChange={(e) => setSellerCoachId(e.target.value)} className={selectClass}><option value="">Usar coach do aluno</option>{options.coaches.map((c) => <option key={c.id} value={c.id}>{c.label} {c.detail ? `— ${c.detail}` : ""}</option>)}</select>
          </Field>
          <Field label="Aluno indicador opcional">
            <select value={referrerStudentId} onChange={(e) => setReferrerStudentId(e.target.value)} className={selectClass}><option value="">Sem indicação aluno→aluno</option>{options.students.filter((s) => s.id !== buyerStudentId).map((s) => <option key={s.id} value={s.id}>{s.label} {s.detail ? `— ${s.detail}` : ""}</option>)}</select>
          </Field>
          <Field label="Método">
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className={selectClass}><option value="pix">PIX</option><option value="credit_card">Crédito</option><option value="debit_card">Débito</option></select>
          </Field>
        </div>
        {selectedProduct && <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/70"><span className="text-white/45">Selecionado:</span> <b className="text-white">{selectedProduct.label}</b> · {money(selectedProduct.price || 0)} · {selectedProduct.detail}</div>}
        <button onClick={submit} disabled={busy || !buyerStudentId || !productId} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50 md:w-auto"><WalletCards className="h-4 w-4" /> {busy ? "Processando..." : "Simular venda paga"}</button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white/70">Simulações registradas</h2>
        {sales.length === 0 ? <div className="rounded-xl border border-white/5 p-8 text-center text-sm text-white/45" style={{ backgroundColor: "#1A1A1A" }}>Nenhuma venda simulada ainda.</div> : sales.map((row) => <SaleCard key={`${row.kind}-${row.id}`} row={row} onDelete={() => deleteOne(row)} busy={busy} />)}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-2 text-xs font-semibold text-white/70"><span>{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><p className="text-[11px] uppercase tracking-wide text-white/45">{label}</p><p className="text-lg font-bold text-white">{value}</p></div>;
}

function SaleCard({ row, onDelete, busy }: { row: SaleRow; onDelete: () => void; busy: boolean }) {
  return (
    <article className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><b className="text-white">#{row.orderNumber}</b><span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{row.status}</span><span className="text-xs text-white/40">{row.kind}</span></div>
          <p className="mt-1 text-sm text-white/65">{row.buyerName || "Aluno"} · {row.productName || "Produto"}</p>
          <a href={row.payUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Abrir link de pagamento/teste</a>
        </div>
        <div className="flex items-center gap-3 lg:text-right"><p className="text-xl font-bold text-primary">{money(row.amount)}</p><button onClick={onDelete} disabled={busy} className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div>
      </div>
      <div className="mt-4 grid gap-2 border-t border-white/5 pt-3 md:grid-cols-2 xl:grid-cols-3">
        {row.flow.length === 0 ? <p className="text-xs text-white/40">Sem lançamentos de comissão encontrados.</p> : row.flow.map((item, index) => (
          <div key={`${row.id}-${index}`} className={`rounded-lg p-3 text-xs ${item.kind === "benefit" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-white/5"}`}>
            <p className={item.kind === "benefit" ? "text-emerald-300" : "text-white/50"}>{item.label}{item.recipient ? ` · ${item.recipient}` : ""}</p>
            {item.kind === "benefit" ? (
              <p className="mt-1 text-sm font-semibold text-emerald-100">{item.info || "Liberado"}</p>
            ) : (
              <p className="mt-1 font-mono text-base font-bold text-white">{money(item.amount)}</p>
            )}
            <p className="text-white/35">{item.status || "—"}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
