import { useEffect, useState } from "react";
import { Star, Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MLMSimulator } from "@/components/coach/MLMSimulator";
import { money } from "@/routes/coach";

type ProductRow = { id: string; name: string; subtitle: string | null; description: string | null; price: number | null; original_price: number | null; is_featured: boolean | null; commission_coach: number | null; commission_level1: number | null; commission_level2: number | null; commission_level3: number | null; badge_label: string | null; status: string | null };

export function ProductsTrackTab() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,subtitle,description,price,original_price,is_featured,commission_coach,commission_level1,commission_level2,commission_level3,badge_label,status")
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) toast.error("Erro ao carregar produtos disponíveis");
      setProducts((data as ProductRow[]) || []);
      setLoading(false);
    })();
  }, []);

  const featured = products.find((product) => product.is_featured) || products[0];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Esteira de Produtos</h1>
        <p className="text-sm text-white/50">Produtos disponíveis e ganhos estimados por venda</p>
      </div>

      {featured && (
        <div className="mb-6 rounded-2xl border border-primary/40 p-5" style={{ background: "linear-gradient(135deg, rgba(220,38,38,0.22), #1A1A1A 58%)" }}>
          <div className="mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase text-primary">Produto em destaque</span>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{featured.name}</h2>
              <p className="mt-1 max-w-2xl text-sm text-white/60">{featured.subtitle || featured.description || "Condição especial para foco de venda neste ciclo."}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Venda", money(featured.price)],
                ["Você", `${featured.commission_coach || 0}%`],
                ["N1", `${featured.commission_level1 || 0}%`],
                ["N2/N3", `${featured.commission_level2 || 0}% / ${featured.commission_level3 || 0}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-black/25 p-3">
                  <p className="text-[10px] uppercase text-white/40">{label}</p>
                  <p className="text-sm font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando produtos...</p> : products.length === 0 ? <p className="text-sm text-white/50">Nenhum produto ativo encontrado.</p> : (
          <div className="grid gap-3 md:grid-cols-2">
            {products.map((product, index) => {
              const coachGain = Number(product.price || 0) * Number(product.commission_coach || 0) / 100;
              return (
                <div key={product.id} className="rounded-xl border border-white/5 p-4" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-white/35">Etapa {index + 1}</p>
                      <h3 className="text-sm font-bold text-white">{product.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-white/45">{product.subtitle || product.description || "Produto disponível para venda."}</p>
                    </div>
                    <span className="rounded-full bg-primary/20 px-2 py-1 text-[10px] font-bold text-primary">{product.badge_label || "Ativo"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white/5 p-2"><span className="text-white/40">Preço</span><p className="font-bold text-white">{money(product.price)}</p></div>
                    <div className="rounded-lg bg-white/5 p-2"><span className="text-white/40">Ganho direto</span><p className="font-bold text-success">{money(coachGain)}</p></div>
                    <div className="rounded-lg bg-white/5 p-2"><span className="text-white/40">Rede N1</span><p className="font-bold text-white">{product.commission_level1 || 0}%</p></div>
                    <div className="rounded-lg bg-white/5 p-2"><span className="text-white/40">Rede N2/N3</span><p className="font-bold text-white">{product.commission_level2 || 0}% / {product.commission_level3 || 0}%</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-4 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-white">Simulador de ganhos</h2>
        </div>
        <MLMSimulator />
      </div>
    </>
  );
}

export default ProductsTrackTab;
