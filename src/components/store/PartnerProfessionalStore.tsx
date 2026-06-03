import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Kind = "partner" | "professional";

type Section = { id: string; name: string; image_url: string | null };
type Category = { id: string; section_id: string; name: string; image_url: string | null };

type PartnerRow = {
  id: string; name: string; description: string | null; image_url: string | null; price: number;
  section_id: string | null; category_id: string | null;
  partner_id: string;
  partners?: { fantasy_name: string | null } | null;
};
type ProRow = {
  id: string; name: string; description: string | null; image_url: string | null; price: number;
  section_id: string | null; category_id: string | null;
  coach_id: string;
  coaches?: { name: string | null } | null;
};

type Card = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  section_id: string | null;
  category_id: string | null;
  seller: string;
};

function money(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export function PartnerProfessionalStore({ kind }: { kind: Kind }) {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);

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
          ((data as unknown as PartnerRow[]) || []).map((r) => ({
            id: r.id, name: r.name, description: r.description, image_url: r.image_url, price: Number(r.price),
            section_id: r.section_id, category_id: r.category_id,
            seller: r.partners?.fantasy_name || "Parceiro",
          })),
        );
      } else {
        const { data } = await supabase
          .from("professional_products" as never)
          .select("id,name,description,image_url,price,section_id,category_id,coach_id,coaches(name)")
          .eq("status" as never, "approved")
          .eq("is_active_by_professional" as never, true);
        setCards(
          ((data as unknown as ProRow[]) || []).map((r) => ({
            id: r.id, name: r.name, description: r.description, image_url: r.image_url, price: Number(r.price),
            section_id: r.section_id, category_id: r.category_id,
            seller: r.coaches?.name || "Profissional",
          })),
        );
      }
      setLoading(false);
    })();
  }, [kind]);

  if (loading) return <p className="text-sm text-white/50">Carregando...</p>;
  if (cards.length === 0) return <p className="text-sm text-white/50 text-center py-10">Nenhum produto disponível ainda.</p>;

  const usedSectionIds = new Set(cards.map((c) => c.section_id).filter(Boolean) as string[]);
  const visibleSections = sections.filter((s) => usedSectionIds.has(s.id));

  const grouped = (sectionId: string | null) => {
    const inSection = sectionId ? cards.filter((c) => c.section_id === sectionId) : cards;
    const byCat = new Map<string | null, Card[]>();
    for (const c of inSection) {
      const k = c.category_id || null;
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(c);
    }
    return Array.from(byCat.entries()).map(([catId, items]) => ({
      catId,
      catName: categories.find((c) => c.id === catId)?.name || "Sem subcategoria",
      items,
    }));
  };

  return (
    <div className="space-y-4">
      {visibleSections.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setActiveSection(null)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${activeSection === null ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/70"}`}>
            Todas
          </button>
          {visibleSections.map((s) => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${activeSection === s.id ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/70"}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {grouped(activeSection).map((g) => (
        <div key={g.catId || "none"}>
          <h3 className="mb-2 text-xs font-bold uppercase text-white/50">{g.catName}</h3>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {g.items.map((p) => (
              <div key={p.id} className="rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#1A1A1A" }}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="mb-2 h-32 w-full rounded object-cover" />
                ) : (
                  <div className="mb-2 h-32 w-full rounded bg-white/5" />
                )}
                <p className="text-[10px] text-white/40 uppercase font-bold">{p.seller}</p>
                <p className="text-sm font-bold text-white line-clamp-2">{p.name}</p>
                {p.description && <p className="mt-1 text-[11px] text-white/45 line-clamp-2">{p.description}</p>}
                <p className="mt-2 text-base font-bold text-primary">{money(p.price)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
