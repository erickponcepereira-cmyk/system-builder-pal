import { createFileRoute } from "@tanstack/react-router";
import { Search, ShoppingBag, Tag } from "lucide-react";

export const Route = createFileRoute("/student/store")({
  component: StorePage,
});

const categories = ["Todos", "Suplementos", "Roupas", "Acessórios", "Herbalife"];

const products = [
  { id: 1, name: "Whey Protein 900g", price: 189.9, oldPrice: 229.9, tag: "Mais vendido" },
  { id: 2, name: "Shake Herbalife Fórmula 1", price: 245.0, tag: "Herbalife" },
  { id: 3, name: "Garrafa Térmica 1L", price: 89.9 },
  { id: 4, name: "Camiseta Dry-Fit FitChain", price: 79.9, oldPrice: 99.9 },
];

function StorePage() {
  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2 flex items-center justify-between">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider">Loja</p>
          <h1 className="text-2xl font-bold text-white">FitChain Store</h1>
        </div>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
          <ShoppingBag className="h-5 w-5 text-white/70" />
          <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">2</span>
        </button>
      </header>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-full px-4 py-3" style={{ backgroundColor: "#1A1A1A" }}>
        <Search className="h-4 w-4 text-white/40" />
        <input
          placeholder="Buscar produtos..."
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
        />
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 scrollbar-none">
        {categories.map((c, i) => (
          <button
            key={c}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              i === 0
                ? "bg-primary text-primary-foreground"
                : "bg-white/5 text-white/60"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Banner promocional */}
      <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))" }}>
        <div className="absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">
            <Tag className="h-3 w-3" /> OFERTA
          </span>
          <p className="text-base font-bold text-white mt-2">Frete grátis nas compras</p>
          <p className="text-sm text-white/90">acima de R$ 199</p>
        </div>
      </div>

      {/* Products grid */}
      <div className="grid grid-cols-2 gap-3">
        {products.map((p) => (
          <button
            key={p.id}
            className="rounded-2xl p-3 text-left transition-colors hover:bg-white/[0.07]"
            style={{ backgroundColor: "#1A1A1A" }}
          >
            <div
              className="mb-3 aspect-square rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "#252525" }}
            >
              <ShoppingBag className="h-8 w-8 text-white/20" />
            </div>
            {p.tag && (
              <span className="inline-block rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary mb-1">
                {p.tag}
              </span>
            )}
            <p className="text-xs font-medium text-white line-clamp-2 min-h-[32px]">{p.name}</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-white">
                R$ {p.price.toFixed(2).replace(".", ",")}
              </span>
              {p.oldPrice && (
                <span className="text-[10px] text-white/30 line-through">
                  R$ {p.oldPrice.toFixed(2).replace(".", ",")}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
