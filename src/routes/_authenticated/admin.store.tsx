import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { StoreManager } from "@/components/admin/StoreManager";
import { StoreItemsManager } from "@/components/admin/StoreItemsManager";

export const Route = createFileRoute("/_authenticated/admin/store")({
  head: () => ({ meta: [{ title: "Loja — Admin FitMind Club" }] }),
  component: StoreAdminPage,
});

function StoreAdminPage() {
  const loc = useLocation();
  const tab = loc.search && (loc.search as any).tab === "items" ? "items" : "sections";
  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-white/10">
        <Link
          to="/admin/store"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "sections" ? "border-primary text-primary" : "border-transparent text-white/60 hover:text-white"}`}
        >
          Seções e Categorias
        </Link>
        <Link
          to="/admin/store"
          search={{ tab: "items" }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "items" ? "border-primary text-primary" : "border-transparent text-white/60 hover:text-white"}`}
        >
          Itens da Loja
        </Link>
      </div>
      {tab === "sections" ? <StoreManager /> : <StoreItemsManager />}
    </div>
  );
}
