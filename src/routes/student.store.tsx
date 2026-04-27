import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Search, ShoppingBag, Sparkles, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/store")({
  component: StorePage,
});

type ProductKind = "challenge" | "digital" | "store";
type PaymentMethod = "pix" | "credit_card" | "debit_card";

interface StoreProduct {
  id: string;
  title: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  category: string;
  kind: ProductKind;
  tag?: string;
  productId?: string;
  digitalProductId?: string;
  storeProductId?: string;
}

const categories = ["Todos", "Desafios", "Cursos", "Suplementos", "Acessórios", "Herbalife"];

function StorePage() {
  const [items, setItems] = useState<StoreProduct[]>([]);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StoreProduct | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [installments, setInstallments] = useState(1);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (profile?.id) {
          const { data: student } = await supabase
            .from("students")
            .select("id")
            .eq("profile_id", profile.id)
            .maybeSingle();
          setStudentId(student?.id ?? null);
        }
      }

      const [plans, digital, physical] = await Promise.all([
        supabase.from("products").select("id,name,description,price,original_price,type,status").eq("status", "active").order("sort_order"),
        supabase.from("digital_products").select("id,title,description,price,original_price,type,status,is_featured").eq("status", "active").order("sort_order"),
        supabase.from("store_products").select("id,name,description,price,original_price,category,status,is_herbalife").eq("status", "active").order("sort_order"),
      ]);

      const normalized: StoreProduct[] = [
        ...((plans.data || []).map((p) => ({
          id: `plan-${p.id}`,
          title: p.name,
          description: p.description,
          price: Number(p.price || 0),
          originalPrice: p.original_price ? Number(p.original_price) : null,
          category: "Desafios",
          kind: "challenge" as const,
          tag: "Desafio",
          productId: p.id,
        }))),
        ...((digital.data || []).map((p) => ({
          id: `digital-${p.id}`,
          title: p.title,
          description: p.description,
          price: Number(p.price || 0),
          originalPrice: p.original_price ? Number(p.original_price) : null,
          category: "Cursos",
          kind: "digital" as const,
          tag: p.is_featured ? "Destaque" : "Digital",
          digitalProductId: p.id,
        }))),
        ...((physical.data || []).map((p) => ({
          id: `store-${p.id}`,
          title: p.name,
          description: p.description,
          price: Number(p.price || 0),
          originalPrice: p.original_price ? Number(p.original_price) : null,
          category: p.is_herbalife ? "Herbalife" : p.category || "Suplementos",
          kind: "store" as const,
          tag: p.is_herbalife ? "Herbalife" : undefined,
          storeProductId: p.id,
        }))),
      ];

      setItems(normalized);
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const categoryMatch = activeCategory === "Todos" || item.category === activeCategory;
      const queryMatch = !needle || item.title.toLowerCase().includes(needle) || item.description?.toLowerCase().includes(needle);
      return categoryMatch && queryMatch;
    });
  }, [activeCategory, items, query]);

  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const checkout = async () => {
    if (!selected || !studentId) {
      toast.error("Entre como aluno para finalizar a compra.");
      return;
    }
    setCheckingOut(true);

    const paymentFeePercent = paymentMethod === "pix" ? 1 : paymentMethod === "debit_card" ? 1.69 : 2.99;
    const paymentFee = selected.price * paymentFeePercent / 100;
    const taxAmount = selected.price * 0.06;
    const netAmount = Math.max(0, selected.price - paymentFee - taxAmount);

    const fallbackProductId = items.find((item) => item.productId)?.productId;
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        student_id: studentId,
        product_id: selected.productId || fallbackProductId,
        digital_product_id: selected.digitalProductId || null,
        store_product_id: selected.storeProductId || null,
        purchase_type: selected.kind,
        gross_amount: selected.price,
        payment_fee: Number(paymentFee.toFixed(2)),
        tax_amount: Number(taxAmount.toFixed(2)),
        net_amount: Number(netAmount.toFixed(2)),
        payment_method: paymentMethod,
        installments,
        status: "pending",
        metadata: { title: selected.title },
      } as never)
      .select("id")
      .single();

    if (error || !data) {
      toast.error(error?.message || "Não foi possível criar o pedido.");
      setCheckingOut(false);
      return;
    }

    toast.success("Pedido criado! O admin pode confirmar o pagamento no painel.");
    setSelected(null);
    setCheckingOut(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Loja</p>
          <h1 className="text-2xl font-bold text-foreground">FitMind Club Store</h1>
        </div>
        <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-card">
          <ShoppingBag className="h-5 w-5 text-muted-foreground" />
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{items.length}</span>
        </div>
      </header>

      <div className="flex items-center gap-2 rounded-full bg-card px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar produtos..."
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              activeCategory === category ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-primary p-4">
        <div className="relative">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            <Tag className="h-3 w-3" /> CHECKOUT
          </span>
          <p className="mt-2 text-base font-bold text-primary-foreground">Desafios, cursos e produtos em um só carrinho</p>
          <p className="text-sm text-primary-foreground/80">pagamento registrado para liberação administrativa</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {filtered.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelected(item)}
            className="rounded-2xl bg-card p-3 text-left transition-colors hover:bg-accent"
          >
            <div className="mb-3 flex aspect-square items-center justify-center rounded-xl bg-muted">
              <ShoppingBag className="h-8 w-8 text-muted-foreground" />
            </div>
            {item.tag && (
              <span className="mb-1 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary">
                {item.tag}
              </span>
            )}
            <p className="min-h-[32px] text-xs font-medium text-foreground line-clamp-2">{item.title}</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
              <span className="text-sm font-bold text-foreground">{fmt(item.price)}</span>
              {item.originalPrice && <span className="text-[10px] text-muted-foreground line-through">{fmt(item.originalPrice)}</span>}
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-foreground">{selected.title}</h2>
                <p className="text-xs text-muted-foreground">{selected.description || "Compra FitMind Club"}</p>
              </div>
              <p className="text-base font-bold text-primary">{fmt(selected.price)}</p>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2">
              {(["pix", "credit_card", "debit_card"] as PaymentMethod[]).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`rounded-xl px-2 py-2 text-xs font-bold ${paymentMethod === method ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {method === "pix" ? "PIX" : method === "credit_card" ? "Crédito" : "Débito"}
                </button>
              ))}
            </div>

            {paymentMethod === "credit_card" && (
              <label className="mb-4 block text-xs text-muted-foreground">
                Parcelas
                <select
                  value={installments}
                  onChange={(event) => setInstallments(Number(event.target.value))}
                  className="mt-1 w-full rounded-xl bg-muted px-3 py-2 text-sm text-foreground outline-none"
                >
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}x de {fmt(selected.price / n)}</option>)}
                </select>
              </label>
            )}

            <div className="flex gap-2">
              <button onClick={() => setSelected(null)} className="flex-1 rounded-xl bg-muted px-4 py-3 text-sm font-bold text-foreground">
                Cancelar
              </button>
              <button onClick={checkout} disabled={checkingOut} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
                <CheckCircle2 className="h-4 w-4" /> Finalizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
