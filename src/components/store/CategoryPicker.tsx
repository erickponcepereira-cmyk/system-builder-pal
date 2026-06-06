import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Section = { id: string; name: string; pending: boolean | null; is_active: boolean; target_audience?: string | null };
type Category = { id: string; section_id: string; name: string; pending: boolean | null; is_active: boolean };

interface Props {
  sectionId: string | null | undefined;
  categoryId: string | null | undefined;
  onChange: (next: { section_id: string | null; category_id: string | null }) => void;
  /** Filtra apenas seções configuradas para esta aba ('partner' | 'professional' | 'fitmind'). */
  targetAudience?: "partner" | "professional" | "fitmind";
  /** Compat: aceito mas ignorado (criação só pelo admin). */
  ownerOnly?: boolean;
}

export function CategoryPicker({ sectionId, categoryId, onChange, targetAudience }: Props) {
  const [sections, setSections] = useState<Section[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const load = async () => {
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("store_sections").select("id,name,pending,is_active,target_audience").order("name"),
      supabase.from("store_categories").select("id,section_id,name,pending,is_active").order("name"),
    ]);
    let secs = ((s as Section[]) || []).filter((x) => x.is_active && !x.pending);
    if (targetAudience) {
      secs = secs.filter((x) => !x.target_audience || x.target_audience === targetAudience);
    }
    setSections(secs);
    setCategories(((c as Category[]) || []).filter((x) => x.is_active && !x.pending));
  };
  useEffect(() => { load(); }, [targetAudience]);

  const filteredCategories = categories.filter((c) => c.section_id === sectionId);

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase text-white/50">Onde aparece na loja</p>

      <div>
        <label className="text-xs text-white/60">Seção</label>
        <select
          value={sectionId || ""}
          onChange={(e) => onChange({ section_id: e.target.value || null, category_id: null })}
          className="mt-1 w-full rounded bg-black/40 border border-white/10 px-2 py-2 text-sm text-white"
        >
          <option value="">— escolher —</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {sectionId && (
        <div>
          <label className="text-xs text-white/60">Subcategoria</label>
          <select
            value={categoryId || ""}
            onChange={(e) => onChange({ section_id: sectionId, category_id: e.target.value || null })}
            className="mt-1 w-full rounded bg-black/40 border border-white/10 px-2 py-2 text-sm text-white"
          >
            <option value="">— escolher —</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <p className="text-[10px] text-white/40">
        Apenas seções e subcategorias criadas pelo admin aparecem aqui. Solicite ao admin caso precise de uma nova.
      </p>
    </div>
  );
}
