import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { X, Search, Plus, Minus, Trash2, ShoppingCart, ArrowLeft, CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  listCoachClients,
  listSellableProducts,
  createCoachSale,
  type SaleClient,
  type SaleProduct,
} from "@/server/coach-sales.functions";
import { previewCoachSaleEarnings, type SaleEarningsItem } from "@/lib/financial.functions";
import type { PaymentMethod } from "@/lib/financialEngine";

type CartItem = {
  productId: string;
  kind: "challenge" | "digital" | "store" | "item";
  title: string;
  unitPrice: number;
  quantity: number;
};

type Step = "client" | "products" | "cart" | "done";

const money = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KIND_LABEL: Record<CartItem["kind"], string> = {
  challenge: "Desafio/Plano",
  digital: "Digital",
  store: "Físico",
  item: "Loja",
};

export function NewSaleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fetchClients = useServerFn(listCoachClients);
  const fetchProducts = useServerFn(listSellableProducts);
  const submitSale = useServerFn(createCoachSale);
  const fetchPreview = useServerFn(previewCoachSaleEarnings);

  const [step, setStep] = useState<Step>("client");
  const [clients, setClients] = useState<SaleClient[]>([]);
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [client, setClient] = useState<SaleClient | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchClient, setSearchClient] = useState("");
  const [searchProduct, setSearchProduct] = useState("");
  const [productKindFilter, setProductKindFilter] = useState<"all" | CartItem["kind"]>("all");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card" | "debit_card">("pix");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ orderNumber: string; payUrl: string; total: number } | null>(null);
  const [preview, setPreview] = useState<{ items: SaleEarningsItem[]; commissionTotal: number; pointsTotal: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("client"); setClient(null); setCart([]); setResult(null);
    setSearchClient(""); setSearchProduct(""); setProductKindFilter("all"); setPaymentMethod("pix");
    fetchClients().then(setClients).catch(() => toast.error("Erro ao carregar clientes"));
    fetchProducts().then(setProducts).catch(() => toast.error("Erro ao carregar produtos"));
  }, [open, fetchClients, fetchProducts]);

  const filteredClients = useMemo(() => {
    const q = searchClient.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));
  }, [clients, searchClient]);

  const filteredProducts = useMemo(() => {
    const q = searchProduct.toLowerCase().trim();
    return products.filter((p) => {
      if (productKindFilter !== "all" && p.kind !== productKindFilter) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q);
    });
  }, [products, searchProduct, productKindFilter]);

  const total = useMemo(() => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0), [cart]);

  // Map UI payment to engine PaymentMethod
  const enginePaymentMethod: PaymentMethod = paymentMethod === "pix" ? "pix" : paymentMethod === "debit_card" ? "debit" : "credit_1x";

  useEffect(() => {
    if (!cart.length) { setPreview(null); return; }
    let cancelled = false;
    fetchPreview({
      data: {
        items: cart.map((c) => ({ productId: c.productId, kind: c.kind, title: c.title, unitPrice: c.unitPrice, quantity: c.quantity })),
        paymentMethod: enginePaymentMethod,
      },
    }).then((r) => { if (!cancelled) setPreview(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [cart, enginePaymentMethod, fetchPreview]);

  const addToCart = (p: SaleProduct) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === p.id && i.kind === p.kind);
      if (idx >= 0) {
        const copy = [...prev]; copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 }; return copy;
      }
      return [...prev, { productId: p.id, kind: p.kind, title: p.title, unitPrice: p.price, quantity: 1 }];
    });
    toast.success("Adicionado ao carrinho");
  };

  const updateQty = (idx: number, delta: number) => {
    setCart((prev) => {
      const copy = [...prev];
      const next = copy[idx].quantity + delta;
      if (next <= 0) { copy.splice(idx, 1); } else { copy[idx] = { ...copy[idx], quantity: next }; }
      return copy;
    });
  };

  const removeItem = (idx: number) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const finalize = async () => {
    if (!client || !cart.length) return;
    setSubmitting(true);
    try {
      const res = await submitSale({
        data: {
          clientId: client.id,
          items: cart,
          paymentMethod,
        },
      });
      setResult({ orderNumber: res.orderNumber, payUrl: res.payUrl, total: res.total });
      setStep("done");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao finalizar venda");
    } finally {
      setSubmitting(false);
    }
  };

  const copyPayLink = () => {
    if (!result) return;
    const url = `${window.location.origin}${result.payUrl}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 max-h-[90vh] flex flex-col"
        style={{ backgroundColor: "#0F0F0F" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            {step !== "client" && step !== "done" && (
              <button
                onClick={() => setStep(step === "products" ? "client" : "products")}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/70"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="text-lg font-bold text-white">Nova venda</h2>
              <p className="text-xs text-white/50">
                {step === "client" && "1/3 — Selecione o cliente"}
                {step === "products" && "2/3 — Adicione produtos"}
                {step === "cart" && "3/3 — Revise e finalize"}
                {step === "done" && "Venda criada!"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "client" && (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  value={searchClient}
                  onChange={(e) => setSearchClient(e.target.value)}
                  placeholder="Buscar cliente por nome ou email..."
                  className="w-full rounded-lg pl-10 pr-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
                  style={{ backgroundColor: "#1A1A1A" }}
                />
              </div>
              {filteredClients.length === 0 ? (
                <div className="text-center text-sm text-white/50 py-12">Nenhum cliente encontrado</div>
              ) : (
                <div className="space-y-1.5">
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setClient(c); setStep("products"); }}
                      className="w-full text-left rounded-lg p-3 hover:bg-white/5 transition flex items-center justify-between"
                      style={{ backgroundColor: "#1A1A1A" }}
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{c.name}</p>
                        {c.email && <p className="text-[11px] text-white/40">{c.email}</p>}
                      </div>
                      <ChevronRightIcon />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "products" && (
            <>
              <div className="mb-3 rounded-lg p-3 flex items-center justify-between" style={{ backgroundColor: "#1A1A1A" }}>
                <div>
                  <p className="text-[11px] text-white/40">Cliente</p>
                  <p className="text-sm text-white">{client?.name}</p>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={() => setStep("cart")}
                    className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Carrinho ({cart.length})
                  </button>
                )}
              </div>

              <div className="flex gap-2 mb-3">
                {(["all", "challenge", "digital", "store", "item"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setProductKindFilter(k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                      productKindFilter === k ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {k === "all" ? "Todos" : k === "challenge" ? "Planos" : k === "digital" ? "Digital" : k === "store" ? "Físicos" : "Loja"}
                  </button>
                ))}
              </div>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  placeholder="Buscar produto..."
                  className="w-full rounded-lg pl-10 pr-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
                  style={{ backgroundColor: "#1A1A1A" }}
                />
              </div>

              {filteredProducts.length === 0 ? (
                <div className="text-center text-sm text-white/50 py-12">Nenhum produto encontrado</div>
              ) : (
                <div className="space-y-1.5">
                  {filteredProducts.map((p) => (
                    <div
                      key={`${p.kind}-${p.id}`}
                      className="rounded-lg p-3 flex items-center justify-between"
                      style={{ backgroundColor: "#1A1A1A" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{p.title}</p>
                        <p className="text-[11px] text-white/40">{KIND_LABEL[p.kind]} • {money(p.price)}</p>
                      </div>
                      <button
                        onClick={() => addToCart(p)}
                        className="flex items-center gap-1 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary px-3 py-1.5 text-xs font-bold ml-2"
                      >
                        <Plus className="h-3.5 w-3.5" /> Adicionar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "cart" && (
            <>
              <div className="mb-3 rounded-lg p-3" style={{ backgroundColor: "#1A1A1A" }}>
                <p className="text-[11px] text-white/40">Cliente</p>
                <p className="text-sm text-white">{client?.name}</p>
              </div>

              <p className="text-xs text-white/50 mb-2">Itens ({cart.length})</p>
              <div className="space-y-1.5 mb-4">
                {cart.map((it, idx) => (
                  <div key={idx} className="rounded-lg p-3 flex items-center gap-3" style={{ backgroundColor: "#1A1A1A" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{it.title}</p>
                      <p className="text-[11px] text-white/40">{money(it.unitPrice)} cada</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQty(idx, -1)} className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/70">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm text-white w-6 text-center">{it.quantity}</span>
                      <button onClick={() => updateQty(idx, 1)} className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/70">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-sm text-white font-bold w-20 text-right">{money(it.unitPrice * it.quantity)}</p>
                    <button onClick={() => removeItem(idx)} className="p-1 rounded text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep("products")}
                className="w-full rounded-lg bg-white/5 hover:bg-white/10 py-2 text-xs text-white/70 mb-4"
              >
                + Adicionar mais produtos
              </button>

              <p className="text-xs text-white/50 mb-2">Forma de pagamento</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {([
                  { v: "pix", l: "PIX" },
                  { v: "credit_card", l: "Crédito" },
                  { v: "debit_card", l: "Débito" },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setPaymentMethod(opt.v)}
                    className={`rounded-lg py-2 text-xs font-medium ${
                      paymentMethod === opt.v ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>

              <div className="rounded-lg p-4 flex items-center justify-between" style={{ backgroundColor: "#1A1A1A" }}>
                <span className="text-sm text-white/60">Total</span>
                <span className="text-2xl font-bold text-primary">{money(total)}</span>
              </div>
            </>
          )}

          {step === "done" && result && (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-success/15 mb-4">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Venda criada com sucesso!</h3>
              <p className="text-sm text-white/50 mb-6">Pedido #{result.orderNumber} • {money(result.total)}</p>

              <div className="rounded-lg p-4 mb-4 text-left" style={{ backgroundColor: "#1A1A1A" }}>
                <p className="text-xs text-white/50 mb-2">Link de pagamento</p>
                <p className="text-xs text-primary break-all font-mono">
                  {typeof window !== "undefined" ? `${window.location.origin}${result.payUrl}` : result.payUrl}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={copyPayLink}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-white/5 hover:bg-white/10 py-2.5 text-sm text-white"
                >
                  <Copy className="h-4 w-4" /> Copiar link
                </button>
                <a
                  href={result.payUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary hover:opacity-90 py-2.5 text-sm font-bold text-primary-foreground"
                >
                  <ExternalLink className="h-4 w-4" /> Abrir
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "cart" && (
          <div className="p-5 border-t border-white/10 flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white"
            >
              Cancelar
            </button>
            <button
              onClick={finalize}
              disabled={submitting || cart.length === 0}
              className="flex-1 rounded-lg bg-primary hover:opacity-90 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Finalizando..." : `Finalizar venda • ${money(total)}`}
            </button>
          </div>
        )}
        {step === "done" && (
          <div className="p-5 border-t border-white/10">
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-white/5 hover:bg-white/10 py-2.5 text-sm text-white"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
