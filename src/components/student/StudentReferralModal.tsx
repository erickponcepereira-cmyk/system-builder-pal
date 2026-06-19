import { useEffect, useMemo, useState } from "react";
import { X, Search, Copy, Share2, Gift, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type RefProduct = {
  id: string;
  kind: "challenge" | "digital";
  title: string;
  price: number;
  imageUrl: string | null;
  commission: number;
};

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function StudentReferralModal({
  open,
  onClose,
  referralCode,
}: {
  open: boolean;
  onClose: () => void;
  referralCode: string;
}) {
  const [products, setProducts] = useState<RefProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RefProduct | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(null);
    setSearch("");
    setRevealed(new Set());
    (async () => {
      const { data: rules } = await supabase
        .from("product_referral_rules")
        .select("product_id,enabled,is_referral_product" as any)
        .eq("enabled", true)
        .eq("is_referral_product" as any, true);
      const enabledIds = new Set<string>(((rules as any[]) || []).map((r) => r.product_id));
      const ids = Array.from(enabledIds);
      if (ids.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }
      const [{ data: challenges }, { data: slots }] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,price,image_url")
          .eq("status", "active")
          .in("id", ids),
        supabase
          .from("product_value_slots")
          .select("product_id,value_type,value_amount,destination,applies_to_student_referral,is_active" as any)
          .in("product_id", ids)
          .eq("destination" as any, "referral_student"),
      ]);
      const slotByProduct = new Map<string, { type: string; amount: number }>();
      ((slots as any[]) || []).forEach((s) => {
        if (s.is_active === false) return;
        if (s.applies_to_student_referral === false) return;
        slotByProduct.set(s.product_id, {
          type: String(s.value_type),
          amount: Number(s.value_amount || 0),
        });
      });
      const out: RefProduct[] = [];
      (challenges || []).forEach((p: any) => {
        const slot = slotByProduct.get(p.id);
        const price = Number(p.price || 0);
        let commission = 0;
        if (slot) {
          commission = slot.type === "fixed" ? slot.amount : Math.max(0, price * (slot.amount / 100));
        }
        out.push({ id: p.id, kind: "challenge", title: p.name, price, imageUrl: p.image_url, commission });
      });
      setProducts(out);
      setLoading(false);
    })();
  }, [open]);

  const toggleReveal = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) => p.title.toLowerCase().includes(q));
  }, [products, search]);

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "https://fitmindclub.lovable.app";

  const shareUrl = selected ? `${baseUrl}/r/${referralCode}?p=${selected.id}` : "";

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Link copiado!");
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: selected?.title,
          text: `Confira esse produto no FitMind Club: ${selected?.title}`,
          url: shareUrl,
        });
      } catch {/* user cancelled */}
    } else copy();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 sm:rounded-2xl"
        style={{ backgroundColor: "#0F0F0F" }}
      >
        <div className="flex items-center justify-between border-b border-white/5 p-4">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-white">Indique e ganhe</h2>
              <p className="text-[11px] text-white/40">Escolha um produto e compartilhe seu link</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!selected ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="p-4">
              <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                <Search className="h-4 w-4 text-white/40" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar produto..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-white/30" /></div>
              ) : filtered.length === 0 ? (
                <p className="rounded-xl p-4 text-center text-xs text-white/40" style={{ backgroundColor: "#1A1A1A" }}>
                  Nenhum produto disponível para indicação.
                </p>
              ) : (
                <div className="space-y-2">
                  {filtered.map((p) => {
                    const isRevealed = revealed.has(p.id);
                    return (
                    <div
                      key={`${p.kind}-${p.id}`}
                      className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-white/5"
                      style={{ backgroundColor: "#1A1A1A" }}
                    >
                      <button onClick={() => setSelected(p)} className="flex flex-1 items-center gap-3 text-left min-w-0">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.title} className="h-12 w-12 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
                            <Gift className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{p.title}</p>
                          <p className="text-[11px] text-white/40">
                            {p.kind === "challenge" ? "Desafio/Plano" : "Digital"} · {money(p.price)}
                          </p>
                          <p className="mt-0.5 text-[11px] font-bold text-primary">
                            Cashback: {isRevealed ? `${p.commission.toFixed(2).replace(".", ",")} Fitcoin` : "••••••"}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={(e) => toggleReveal(p.id, e)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                        title={isRevealed ? "Ocultar cashback" : "Mostrar cashback"}
                      >
                        {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <button
              onClick={() => setSelected(null)}
              className="self-start text-[11px] font-bold text-primary hover:underline"
            >
              ← Trocar produto
            </button>
            <div className="rounded-xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex items-center gap-3">
                {selected.imageUrl ? (
                  <img src={selected.imageUrl} alt={selected.title} className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Gift className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{selected.title}</p>
                  <p className="text-[11px] text-white/40">{money(selected.price)}</p>
                  <p className="mt-1 text-[11px] font-bold text-primary">
                    Você ganha {selected.commission.toFixed(2).replace(".", ",")} Fitcoin por venda (1 FC = R$ 1, use na loja)
                  </p>
                </div>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/40">
                Seu link de indicação
              </p>
              <div className="flex items-center gap-2 rounded-xl bg-black/40 px-3 py-2.5">
                <span className="flex-1 truncate font-mono text-xs text-white">{shareUrl}</span>
                <button onClick={copy} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 hover:bg-primary/30">
                  <Copy className="h-3.5 w-3.5 text-primary" />
                </button>
              </div>
            </div>
            <button
              onClick={share}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90"
            >
              <Share2 className="h-4 w-4" /> Compartilhar
            </button>
            <p className="text-center text-[10px] text-white/40">
              Quando alguém comprar pelo seu link, você recebe a comissão de indicação.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentReferralModal;
