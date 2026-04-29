import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Minus, Plus, Search, ShoppingBag, Sparkles, Tag, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/store")({
  component: StorePage,
});

type ProductKind = "challenge" | "digital" | "store";
type PaymentMethod = "pix" | "credit_card" | "debit_card";

interface StoreProduct {
  id: string;
  sourceId: string;
  title: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  category: string;
  kind: ProductKind;
  tag?: string;
  stock?: number | null;
}

type CartItem = StoreProduct & { quantity: number };
type OrderRow = { id: string; order_number: string; status: string; total_amount: number; created_at: string | null };

type ShippingForm = { name: string; phone: string; zip: string; address: string; city: string; state: string };

const categories = ["Todos", "Desafios", "Cursos", "Suplementos", "Acessórios", "Herbalife"];
const initialShipping: ShippingForm = { name: "", phone: "", zip: "", address: "", city: "", state: "" };

function StorePage() {
  const [items, setItems] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [shipping, setShipping] = useState<ShippingForm>(initialShipping);
  const [checkingOut, setCheckingOut] = useState(false);

  const load = async () => {
    const [{ data: userData }, plans, digital, physical] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("products").select("id,name,description,price,original_price,type,status").eq("status", "active").order("sort_order"),
      supabase.from("digital_products").select("id,title,description,price,original_price,type,status,is_featured").eq("status", "active").order("sort_order"),
      supabase.from("store_products").select("id,name,description,price,original_price,category,status,is_herbalife,stock").eq("status", "active").order("sort_order"),
    ]);

    if (userData.user) {
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      const { data: student } = profile?.id ? await supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle() : { data: null };
      if (student?.id) {
        const { data: orderData } = await supabase
          .from("store_orders" as never)
          .select("id,order_number,status,total_amount,created_at" as never)
          .eq("student_id" as never, student.id as never)
          .order("created_at" as never, { ascending: false })
          .limit(4);
        setOrders((orderData as unknown as OrderRow[]) || []);
      }
    }

    setItems([
      ...((plans.data || []).map((p) => ({ id: `plan-${p.id}`, sourceId: p.id, title: p.name, description: p.description, price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null, category: "Desafios", kind: "challenge" as const, tag: "Desafio" }))),
      ...((digital.data || []).map((p) => ({ id: `digital-${p.id}`, sourceId: p.id, title: p.title, description: p.description, price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null, category: "Cursos", kind: "digital" as const, tag: p.is_featured ? "Destaque" : "Digital" }))),
      ...((physical.data || []).map((p) => ({ id: `store-${p.id}`, sourceId: p.id, title: p.name, description: p.description, price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null, category: p.is_herbalife ? "Herbalife" : p.category || "Suplementos", kind: "store" as const, tag: p.is_herbalife ? "Herbalife" : undefined, stock: p.stock }))),
    ]);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (activeCategory === "Todos" || item.category === activeCategory) && (!needle || item.title.toLowerCase().includes(needle) || item.description?.toLowerCase().includes(needle)));
  }, [activeCategory, items, query]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const paymentFee = subtotal * (paymentMethod === "pix" ? 0.01 : paymentMethod === "debit_card" ? 0.0169 : 0.0299);
  const taxAmount = subtotal * 0.06;
  const total = subtotal + paymentFee + taxAmount;
  const requiresShipping = cart.some((item) => item.kind === "store");
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const addToCart = (item: StoreProduct) => {
    if (item.kind === "store" && item.stock !== null && item.stock !== undefined && item.stock <= 0) {
      toast.error("Produto sem estoque.");
      return;
    }
    setCart((current) => {
      const found = current.find((cartItem) => cartItem.id === item.id);
      if (found) return current.map((cartItem) => cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem);
      return [...current, { ...item, quantity: 1 }];
    });
    toast.success("Adicionado ao carrinho.");
  };

  const updateQty = (id: string, delta: number) => {
    setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item).filter((item) => item.quantity > 0));
  };

  const checkout = async () => {
    if (cart.length === 0) return;
    if (requiresShipping && (!shipping.name || !shipping.phone || !shipping.address || !shipping.city || !shipping.state)) {
      toast.error("Preencha os dados de entrega.");
      return;
    }
    setCheckingOut(true);
    const payload = cart.map((item) => ({ kind: item.kind, sourceId: item.sourceId, quantity: item.quantity }));
    const { error } = await supabase.rpc("create_store_order" as never, { _items: payload, _payment_method: paymentMethod, _shipping: shipping, _notes: null } as never);
    if (error) toast.error(error.message);
    else {
      toast.success("Pedido criado! Acompanhe o status na loja.");
      setCart([]);
      setCartOpen(false);
      setShipping(initialShipping);
      await load();
    }
    setCheckingOut(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="flex items-center justify-between pt-2">
        <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Loja</p><h1 className="text-2xl font-bold text-foreground">FitMind Club Store</h1></div>
        <button onClick={() => setCartOpen(true)} className="relative flex h-10 w-10 items-center justify-center rounded-full bg-card"><ShoppingBag className="h-5 w-5 text-muted-foreground" /><span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{cart.reduce((s, i) => s + i.quantity, 0)}</span></button>
      </header>

      <div className="flex items-center gap-2 rounded-full bg-card px-4 py-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produtos..." className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" /></div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none">{categories.map((category) => <button key={category} onClick={() => setActiveCategory(category)} className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${activeCategory === category ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>{category}</button>)}</div>

      <div className="relative overflow-hidden rounded-2xl bg-primary p-4"><span className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[10px] font-bold text-primary-foreground"><Tag className="h-3 w-3" /> CARRINHO REAL</span><p className="mt-2 text-base font-bold text-primary-foreground">Desafios, cursos e produtos em um só pedido</p><p className="text-sm text-primary-foreground/80">estoque, endereço e status ficam registrados</p></div>

      {orders.length > 0 && <section className="rounded-2xl bg-card p-4"><h2 className="mb-3 text-sm font-bold text-foreground">Meus pedidos</h2><div className="space-y-2">{orders.map((order) => <div key={order.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2"><div><p className="text-xs font-bold text-foreground">{order.order_number}</p><p className="text-[10px] text-muted-foreground">{order.status}</p></div><span className="text-xs font-bold text-primary">{fmt(Number(order.total_amount || 0))}</span></div>)}</div></section>}

      <div className="grid grid-cols-2 gap-3">{filtered.map((item) => <button key={item.id} onClick={() => addToCart(item)} className="rounded-2xl bg-card p-3 text-left transition-colors hover:bg-accent"><div className="mb-3 flex aspect-square items-center justify-center rounded-xl bg-muted"><ShoppingBag className="h-8 w-8 text-muted-foreground" /></div>{item.tag && <span className="mb-1 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary">{item.tag}</span>}<p className="min-h-[32px] text-xs font-medium text-foreground line-clamp-2">{item.title}</p><div className="mt-1 flex flex-wrap items-baseline gap-1.5"><span className="text-sm font-bold text-foreground">{fmt(item.price)}</span>{item.originalPrice && <span className="text-[10px] text-muted-foreground line-through">{fmt(item.originalPrice)}</span>}</div>{item.kind === "store" && <p className="mt-1 text-[10px] text-muted-foreground">Estoque: {item.stock ?? 0}</p>}</button>)}</div>

      {cartOpen && <div className="fixed inset-0 z-50 flex items-end bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:justify-center"><div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5"><div className="mb-4 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15"><Sparkles className="h-5 w-5 text-primary" /></div><div><h2 className="text-base font-bold text-foreground">Carrinho</h2><p className="text-xs text-muted-foreground">{cart.length} itens no pedido</p></div></div>
        {cart.length === 0 ? <p className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">Seu carrinho está vazio.</p> : <div className="space-y-2">{cart.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-muted p-3"><div className="flex-1"><p className="text-xs font-bold text-foreground">{item.title}</p><p className="text-[10px] text-muted-foreground">{fmt(item.price)} cada</p></div><button onClick={() => updateQty(item.id, -1)}><Minus className="h-4 w-4 text-muted-foreground" /></button><span className="w-5 text-center text-xs font-bold text-foreground">{item.quantity}</span><button onClick={() => updateQty(item.id, 1)}><Plus className="h-4 w-4 text-primary" /></button><button onClick={() => setCart((current) => current.filter((cartItem) => cartItem.id !== item.id))}><Trash2 className="h-4 w-4 text-muted-foreground" /></button></div>)}</div>}
        <div className="my-4 grid grid-cols-3 gap-2">{(["pix", "credit_card", "debit_card"] as PaymentMethod[]).map((method) => <button key={method} onClick={() => setPaymentMethod(method)} className={`rounded-xl px-2 py-2 text-xs font-bold ${paymentMethod === method ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{method === "pix" ? "PIX" : method === "credit_card" ? "Crédito" : "Débito"}</button>)}</div>
        {requiresShipping && <div className="mb-4 grid gap-2"><p className="text-xs font-bold text-foreground">Entrega</p>{(["name", "phone", "zip", "address", "city", "state"] as const).map((field) => <input key={field} value={shipping[field]} onChange={(event) => setShipping((current) => ({ ...current, [field]: event.target.value }))} placeholder={{ name: "Nome", phone: "Telefone", zip: "CEP", address: "Endereço", city: "Cidade", state: "UF" }[field]} className="rounded-xl bg-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground" />)}</div>}
        <div className="mb-4 rounded-xl bg-muted p-3 text-xs text-muted-foreground"><div className="flex justify-between"><span>Subtotal</span><b className="text-foreground">{fmt(subtotal)}</b></div><div className="flex justify-between"><span>Taxas</span><b className="text-foreground">{fmt(paymentFee + taxAmount)}</b></div><div className="mt-2 flex justify-between border-t border-border pt-2 text-sm"><span>Total</span><b className="text-primary">{fmt(total)}</b></div></div>
        <div className="flex gap-2"><button onClick={() => setCartOpen(false)} className="flex-1 rounded-xl bg-muted px-4 py-3 text-sm font-bold text-foreground">Fechar</button><button onClick={checkout} disabled={checkingOut || cart.length === 0} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"><CheckCircle2 className="h-4 w-4" /> Finalizar</button></div>
      </div></div>}
    </div>
  );
}
