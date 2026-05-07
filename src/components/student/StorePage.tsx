import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Gift, Minus, Plus, Search, Share2, ShoppingBag, Sparkles, Tag, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";

type ProductKind = "challenge" | "digital" | "store" | "item";
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
  subtitle?: string | null;
  isPriceRange?: boolean | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  stock?: number | null;
  imageUrl?: string | null;
}

type CartItem = StoreProduct & { quantity: number };
type OrderRow = { id: string; order_number: string; status: string; total_amount: number; created_at: string | null };

type ShippingForm = { name: string; phone: string; zip: string; address: string; city: string; state: string };

const baseCategories = ["Todos", "Inscrições", "Planos 30d", "Protocolos 90d", "Cursos", "Aulões", "Salas", "Herbalife"];
const initialShipping: ShippingForm = { name: "", phone: "", zip: "", address: "", city: "", state: "" };

const productCategory = (type?: string | null) => ({
  enrollment: "Inscrições",
  plan_30: "Planos 30d",
  protocol_90: "Protocolos 90d",
  digital_course: "Cursos",
  coach_training: "Cursos",
  health_pro_course: "Cursos",
  live_class: "Aulões",
  room_rental: "Salas",
  herbalife: "Herbalife",
  physical: "Herbalife",
  challenge: "Planos 30d",
}[type || ""] || "Planos 30d");

export function StorePage() {
  const [items, setItems] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [shipping, setShipping] = useState<ShippingForm>(initialShipping);
  const [checkingOut, setCheckingOut] = useState(false);
  const [payOrder, setPayOrder] = useState<{ id: string; total: number; number: string; email: string; name: string } | null>(null);

  const [storeSections, setStoreSections] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    const [{ data: userData }, plans, digital, physical, sectionsRes, itemsRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("products").select("id,name,subtitle,description,price,original_price,type,product_type,is_price_range,min_price,max_price,badge_label,status").eq("status", "active").order("sort_order"),
      supabase.from("digital_products").select("id,title,description,price,original_price,type,status,is_featured").eq("status", "active").order("sort_order"),
      supabase.from("store_products").select("id,name,description,price,original_price,category,status,is_herbalife,stock").eq("status", "active").order("sort_order"),
      supabase.from("store_sections" as never).select("id,name" as never).eq("is_active" as never, true as never).order("sort_order" as never),
      supabase.from("store_items" as never).select("id,section_id,name,short_description,description,image_url,price,original_price,kind,stock,is_active" as never).eq("is_active" as never, true as never).order("sort_order" as never),
    ]);

    const sections = (sectionsRes.data as unknown as { id: string; name: string }[]) || [];
    setStoreSections(sections);
    const sectionName = (id: string) => sections.find((s) => s.id === id)?.name || "Loja";

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
      ...((plans.data || []).map((p) => ({ id: `plan-${p.id}`, sourceId: p.id, title: p.name, subtitle: p.subtitle, description: p.description, price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null, category: productCategory(String(p.product_type || p.type)), kind: "challenge" as const, tag: p.badge_label || "FitMind", isPriceRange: p.is_price_range, minPrice: p.min_price ? Number(p.min_price) : null, maxPrice: p.max_price ? Number(p.max_price) : null }))),
      ...((digital.data || []).map((p) => ({ id: `digital-${p.id}`, sourceId: p.id, title: p.title, description: p.description, price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null, category: "Cursos", kind: "digital" as const, tag: p.is_featured ? "Destaque" : "Curso" }))),
      ...((physical.data || []).map((p) => ({ id: `store-${p.id}`, sourceId: p.id, title: p.name, description: p.description, price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null, category: p.is_herbalife ? "Herbalife" : p.category || "Suplementos", kind: "store" as const, tag: p.is_herbalife ? "Herbalife" : undefined, stock: p.stock }))),
      ...(((itemsRes.data as unknown as any[]) || []).map((it) => ({
        id: `item-${it.id}`,
        sourceId: it.id,
        title: it.name,
        subtitle: it.short_description,
        description: it.description,
        price: Number(it.price || 0),
        originalPrice: it.original_price ? Number(it.original_price) : null,
        category: sectionName(it.section_id),
        kind: "item" as const,
        tag: it.kind === "digital" ? "Digital" : undefined,
        stock: it.kind === "physical" ? it.stock : null,
        imageUrl: it.image_url,
      }))),
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
  const requiresShipping = cart.some((item) => item.kind === "store" || (item.kind === "item" && item.stock !== null && item.stock !== undefined));
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const priceLabel = (item: StoreProduct) => item.isPriceRange && item.minPrice && item.maxPrice ? `${fmt(item.minPrice)} - ${fmt(item.maxPrice)}` : fmt(item.price);

  const addToCart = (item: StoreProduct) => {
    if ((item.kind === "store" || item.kind === "item") && item.stock !== null && item.stock !== undefined && item.stock <= 0) {
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
    const { data: orderId, error } = await supabase.rpc("create_store_order" as never, { _items: payload, _payment_method: paymentMethod, _shipping: shipping, _notes: null } as never);
    if (error) {
      toast.error(error.message);
      setCheckingOut(false);
      return;
    }
    // Buscar dados do pedido criado para abrir o checkout MP
    const { data: orderData } = await supabase
      .from("store_orders" as never)
      .select("id,order_number,total_amount" as never)
      .eq("id" as never, orderId as never)
      .maybeSingle();
    const { data: userData } = await supabase.auth.getUser();
    const od = orderData as unknown as { id: string; order_number: string; total_amount: number } | null;
    if (od) {
      setCart([]);
      setCartOpen(false);
      setShipping(initialShipping);
      setPayOrder({
        id: od.id,
        total: Number(od.total_amount),
        number: od.order_number,
        email: userData.user?.email || "",
        name: userData.user?.user_metadata?.name || "",
      });
      await load();
    }
    setCheckingOut(false);
  };

  const inviteFriend = async () => {
    const text = "Entre no FitMind Club pelo meu convite.";
    if (navigator.share) {
      await navigator.share({ title: "FitMind Club", text, url: window.location.origin });
      return;
    }
    await navigator.clipboard.writeText(window.location.origin);
    toast.success("Link de indicação copiado.");
  };

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="flex items-center justify-between pt-2">
        <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Loja</p><h1 className="text-2xl font-bold text-foreground">FitMind Club Store</h1></div>
        <div className="flex items-center gap-2">
          <Link to="/student/freebies" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-3 text-[10px] font-bold text-foreground"><Gift className="h-3.5 w-3.5 text-primary" /> Grátis</Link>
          <button onClick={inviteFriend} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-3 text-[10px] font-bold text-primary-foreground"><Share2 className="h-3.5 w-3.5" /> Indique</button>
          <button onClick={() => setCartOpen(true)} className="relative flex h-10 w-10 items-center justify-center rounded-full bg-card"><ShoppingBag className="h-5 w-5 text-muted-foreground" /><span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{cart.reduce((s, i) => s + i.quantity, 0)}</span></button>
        </div>
      </header>

      <div className="flex items-center gap-2 rounded-full bg-card px-4 py-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produtos..." className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" /></div>

      <div className="flex w-full gap-2 overflow-x-auto scrollbar-none">{[...baseCategories, ...storeSections.map((s) => s.name).filter((n) => !baseCategories.includes(n))].map((category: string) => <button key={category} onClick={() => setActiveCategory(category)} className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${activeCategory === category ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>{category}</button>)}</div>

      <div className="relative overflow-hidden rounded-2xl bg-primary p-4"><span className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[10px] font-bold text-primary-foreground"><Tag className="h-3 w-3" /> FITMIND SECRETS 2026</span><p className="mt-2 text-base font-bold text-primary-foreground">Inscrições, planos, protocolos, cursos e aulões</p><p className="text-sm text-primary-foreground/80">catálogo oficial com comissões configuradas</p></div>

      {orders.length > 0 && <section className="rounded-2xl bg-card p-4"><h2 className="mb-3 text-sm font-bold text-foreground">Meus pedidos</h2><div className="space-y-2">{orders.map((order) => <div key={order.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2"><div><p className="text-xs font-bold text-foreground">{order.order_number}</p><p className="text-[10px] text-muted-foreground">{order.status}</p></div><span className="text-xs font-bold text-primary">{fmt(Number(order.total_amount || 0))}</span></div>)}</div></section>}

      <div className="grid grid-cols-2 gap-3">{filtered.map((item) => <button key={item.id} onClick={() => addToCart(item)} className="rounded-2xl bg-card p-3 text-left transition-colors hover:bg-accent"><div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted">{item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" /> : <ShoppingBag className="h-8 w-8 text-muted-foreground" />}</div>{item.tag && <span className="mb-1 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary">{item.tag}</span>}<p className="min-h-[32px] text-xs font-medium text-foreground line-clamp-2">{item.title}</p>{item.subtitle && <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{item.subtitle}</p>}<div className="mt-1 flex flex-wrap items-baseline gap-1.5"><span className="text-sm font-bold text-foreground">{priceLabel(item)}</span>{item.originalPrice && <span className="text-[10px] text-muted-foreground line-through">{fmt(item.originalPrice)}</span>}</div>{(item.kind === "store" || item.kind === "item") && item.stock !== null && item.stock !== undefined && <p className="mt-1 text-[10px] text-muted-foreground">Estoque: {item.stock}</p>}</button>)}</div>

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
