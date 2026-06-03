import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Loader2, ShoppingBag } from "lucide-react";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";

type Kind = "partner" | "professional";

type Section = { id: string; name: string; image_url: string | null };
type Category = { id: string; section_id: string; name: string; image_url: string | null };

type Card = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  section_id: string | null;
  category_id: string | null;
  seller: string;
  kind: Kind;
};

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PartnerProfessionalStore({ kind }: { kind: Kind }) {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Card | null>(null);
  const [buying, setBuying] = useState(false);
  const [payOrder, setPayOrder] = useState<{ id: string; total: number; number: string; email: string; name: string } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: s }, { data: c }] = await Promise.all([
        supabase.from("store_sections").select("id,name,image_url").eq("is_active", true).order("sort_order"),
        supabase.from("store_categories").select("id,section_id,name,image_url").eq("is_active", true).order("sort_order"),
      ]);
      setSections((s as Section[]) || []);
      setCategories((c as Category[]) || []);

      if (kind === "partner") {
        const { data } = await supabase
          .from("partner_products" as never)
          .select("id,name,description,image_url,price,section_id,category_id,partner_id,partners(fantasy_name)")
          .eq("status" as never, "approved")
          .eq("kind" as never, "paid")
          .eq("is_active_by_partner" as never, true);
        setCards(
          ((data as unknown as Array<{ id: string; name: string; description: string | null; image_url: string | null; price: number; section_id: string | null; category_id: string | null; partners?: { fantasy_name: string | null } | null }>) || []).map((r) => ({
            id: r.id, name: r.name, description: r.description, image_url: r.image_url, price: Number(r.price),
            section_id: r.section_id, category_id: r.category_id,
            seller: r.partners?.fantasy_name || "Parceiro",
            kind: "partner",
          })),
        );
      } else {
        const { data } = await supabase
          .from("professional_products" as never)
          .select("id,name,description,image_url,price,section_id,category_id,coach_id,coaches(name)")
          .eq("status" as never, "approved")
          .eq("is_active_by_professional" as never, true);
        setCards(
          ((data as unknown as Array<{ id: string; name: string; description: string | null; image_url: string | null; price: number; section_id: string | null; category_id: string | null; coaches?: { name: string | null } | null }>) || []).map((r) => ({
            id: r.id, name: r.name, description: r.description, image_url: r.image_url, price: Number(r.price),
            section_id: r.section_id, category_id: r.category_id,
            seller: r.coaches?.name || "Profissional",
            kind: "professional",
          })),
        );
      }
      setLoading(false);
    })();
  }, [kind]);

  const buy = async (method: "pix" | "card") => {
    if (!selected) return;
    if (selected.kind === "partner") {
      toast.info("Compras de produtos de empresas parceiras acontecem na loja principal.");
      return;
    }
    setBuying(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: ppId, error: ppErr } = await supabase.rpc("create_partner_product_order" as never, {
        _professional_product_id: selected.id,
        _payment_method: method,
      } as never);
      if (ppErr) throw new Error(ppErr.message);
      if (!ppId) throw new Error("Pedido não retornado");
      const { data: od } = await supabase
        .from("partner_product_orders" as never)
        .select("id,order_number,gross_amount")
        .eq("id" as never, ppId as never)
        .maybeSingle();
      const o = od as unknown as { id: string; order_number: string; gross_amount: number } | null;
      setPayOrder({
        id: o?.id || String(ppId),
        total: Number(o?.gross_amount || selected.price),
        number: o?.order_number || "pedido",
        email: userData.user?.email || "",
        name: (userData.user?.user_metadata as { name?: string } | undefined)?.name || "",
      });
      setSelected(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar pedido";
      toast.error(msg);
    } finally {
      setBuying(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (cards.length === 0) return <p className="text-sm text-white/50 text-center py-10">Nenhum produto disponível ainda.</p>;

  const usedSectionIds = new Set(cards.map((c) => c.section_id).filter(Boolean) as string[]);
  const visibleSections = sections.filter((s) => usedSectionIds.has(s.id));

  // Drill-down: section list → categories → products of category
  if (!activeSection) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-bold text-white">Seções</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {visibleSections.map((s) => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className="group overflow-hidden rounded-xl border border-white/5 text-left" style={{ backgroundColor: "#1A1A1A" }}>
              {s.image_url ? (
                <img src={s.image_url} alt={s.name} className="h-28 w-full object-cover transition group-hover:scale-105" />
              ) : (
                <div className="h-28 w-full bg-white/5" />
              )}
              <p className="p-3 text-sm font-bold text-white">{s.name}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const sectionCats = categories.filter((c) => c.section_id === activeSection);
  const usedCatIds = new Set(cards.filter((c) => c.section_id === activeSection).map((c) => c.category_id).filter(Boolean) as string[]);
  const visibleCats = sectionCats.filter((c) => usedCatIds.has(c.id));
  const currentSection = sections.find((s) => s.id === activeSection);

  if (!activeCategory) {
    return (
      <div className="space-y-3">
        <button onClick={() => setActiveSection(null)} className="text-xs text-white/60 hover:text-primary">← Voltar para seções</button>
        <h2 className="text-base font-bold text-white">{currentSection?.name}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {visibleCats.map((c) => (
            <button key={c.id} onClick={() => setActiveCategory(c.id)} className="group overflow-hidden rounded-xl border border-white/5 text-left" style={{ backgroundColor: "#1A1A1A" }}>
              {c.image_url ? (
                <img src={c.image_url} alt={c.name} className="h-28 w-full object-cover transition group-hover:scale-105" />
              ) : (
                <div className="h-28 w-full bg-white/5" />
              )}
              <p className="p-3 text-sm font-bold text-white">{c.name}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const items = cards.filter((c) => c.section_id === activeSection && c.category_id === activeCategory);
  const currentCat = categories.find((c) => c.id === activeCategory);

  return (
    <>
      <div className="space-y-3">
        <button onClick={() => setActiveCategory(null)} className="text-xs text-white/60 hover:text-primary">← Voltar para {currentSection?.name}</button>
        <h2 className="text-base font-bold text-white">{currentCat?.name}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {items.map((p) => (
            <button key={p.id} onClick={() => setSelected(p)} className="rounded-xl border border-white/5 p-3 text-left transition hover:ring-1 hover:ring-primary/40" style={{ backgroundColor: "#1A1A1A" }}>
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="mb-2 h-32 w-full rounded object-cover" />
              ) : (
                <div className="mb-2 flex h-32 w-full items-center justify-center rounded bg-white/5"><ShoppingBag className="h-8 w-8 text-white/30" /></div>
              )}
              <p className="text-[10px] uppercase font-bold text-white/40">{p.seller}</p>
              <p className="text-sm font-bold text-white line-clamp-2">{p.name}</p>
              <p className="mt-2 text-base font-bold text-primary">{money(p.price)}</p>
            </button>
          ))}
          {items.length === 0 && <p className="col-span-full text-sm text-white/50">Nenhum produto nesta subcategoria.</p>}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1A1A]">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-2xl bg-white/5">
              {selected.image_url ? (
                <img src={selected.image_url} alt={selected.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-white/30"><ShoppingBag className="h-16 w-16" /></div>
              )}
              <button onClick={() => setSelected(null)} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40">{selected.seller}</p>
                <h2 className="mt-1 text-xl font-bold text-white">{selected.name}</h2>
                <p className="mt-2 text-2xl font-bold text-primary">{money(selected.price)}</p>
              </div>
              {selected.description && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white/40">Descrição</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-white/85">{selected.description}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button disabled={buying} onClick={() => buy("pix")} className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {buying ? "Processando..." : "Comprar com PIX"}
                </button>
                <button disabled={buying} onClick={() => buy("card")} className="flex-1 rounded-lg border border-primary/40 px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/10 disabled:opacity-50">
                  {buying ? "..." : "Comprar com Cartão"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {payOrder && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1A1A] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Pagamento</h2>
                <p className="text-xs text-white/50">Pedido {payOrder.number}</p>
              </div>
              <button onClick={() => setPayOrder(null)} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">Fechar</button>
            </div>
            <MercadoPagoCheckout
              source={{ kind: "partner_product_order", id: payOrder.id }}
              amount={payOrder.total}
              description={`Pedido ${payOrder.number}`}
              defaultPayer={{ email: payOrder.email, name: payOrder.name }}
              onApproved={() => { toast.success("Pagamento aprovado!"); setPayOrder(null); }}
            />
          </div>
        </div>
      )}
    </>
  );
}
