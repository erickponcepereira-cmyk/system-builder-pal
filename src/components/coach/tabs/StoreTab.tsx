import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StorePage } from "@/components/student/StorePage";
import { money } from "@/routes/coach";
import { useMyReferralCode, shareReferralProduct } from "@/lib/useMyReferralCode";

type StoreProductRow = { id: string; name: string; description: string | null; price: number; original_price: number | null; category: string | null; stock: number | null; is_herbalife: boolean | null; status: string | null };
type DigitalProductRow = { id: string; title: string; description: string | null; price: number; original_price: number | null; type: string; duration_hours: number | null; access_days: number | null; is_featured: boolean | null; instructor: string | null; status: string | null };

export function PhysicalStoreTab({ hasUpline }: { hasUpline: boolean }) {
  return <StorePage coachMode hasUpline={hasUpline} />;
}

export function DigitalStoreTab() {
  const [items, setItems] = useState<DigitalProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("digital_products").select("id,title,description,price,original_price,type,duration_hours,access_days,is_featured,instructor,status").eq("status", "active").order("sort_order", { ascending: true });
      if (error) toast.error("Erro ao carregar loja digital");
      setItems((data as DigitalProductRow[]) || []);
      setLoading(false);
    })();
  }, []);
  return <StoreGrid title="Loja de Produtos Digitais" subtitle="Cursos, mentorias e materiais para venda e uso do coach" items={items} loading={loading} kind="digital" />;
}

export function StoreGrid({ title, subtitle, items, loading, kind }: { title: string; subtitle: string; items: (StoreProductRow | DigitalProductRow)[]; loading: boolean; kind: "physical" | "digital" }) {
  const referralCode = useMyReferralCode();
  const onShare = async (id: string) => {
    if (!referralCode) { toast.error("Código de indicação indisponível."); return; }
    const ok = await shareReferralProduct(referralCode, id);
    if (ok) toast.success("Link de indicação copiado!");
  };
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <p className="text-sm text-white/50">{subtitle}</p>
      </div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando produtos...</p> : items.length === 0 ? <p className="text-sm text-white/50">Nenhum produto ativo encontrado.</p> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const isDigital = kind === "digital";
              const titleText = isDigital ? (item as DigitalProductRow).title : (item as StoreProductRow).name;
              const original = item.original_price;
              const discount = original && original > item.price ? Math.round(((original - item.price) / original) * 100) : 0;
              return (
                <div key={item.id} className="rounded-xl border border-white/5 p-4" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/60">{isDigital ? (item as DigitalProductRow).type : (item as StoreProductRow).category || "Produto"}</span>
                    {discount > 0 && <span className="rounded-full bg-success/20 px-2 py-1 text-[10px] font-bold text-success">-{discount}% coach</span>}
                  </div>
                  <h3 className="text-sm font-bold text-white">{titleText}</h3>
                  <p className="mt-1 line-clamp-3 min-h-12 text-xs text-white/45">{item.description || "Produto disponível para apresentação e venda."}</p>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      {original && original > item.price && <p className="text-xs text-white/35 line-through">{money(original)}</p>}
                      <p className="text-lg font-bold text-white">{money(item.price)}</p>
                    </div>
                    <Button size="sm" variant="outline" className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20">Compartilhar</Button>
                  </div>
                  <p className="mt-3 text-[10px] text-white/35">{isDigital ? `${(item as DigitalProductRow).duration_hours || 0}h · acesso ${((item as DigitalProductRow).access_days || 365)} dias` : `${(item as StoreProductRow).stock ?? 0} em estoque`}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export default PhysicalStoreTab;
