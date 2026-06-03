import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

type Section = { id: string; name: string; pending: boolean | null; is_active: boolean };
type Category = { id: string; section_id: string; name: string; pending: boolean | null; is_active: boolean };

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `s-${Date.now()}`;
}

interface Props {
  sectionId: string | null | undefined;
  categoryId: string | null | undefined;
  onChange: (next: { section_id: string | null; category_id: string | null }) => void;
  /** Quando true, só lista seções/categorias criadas pelo próprio usuário. */
  ownerOnly?: boolean;
}

export function CategoryPicker({ sectionId, categoryId, onChange, ownerOnly = false }: Props) {
  const [sections, setSections] = useState<Section[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [creating, setCreating] = useState<"section" | "category" | null>(null);
  const [newName, setNewName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id || null;
    setUserId(uid);
    let sQ: any = supabase.from("store_sections").select("id,name,pending,is_active,created_by").order("name");
    let cQ: any = supabase.from("store_categories").select("id,section_id,name,pending,is_active,created_by").order("name");
    if (ownerOnly && uid) {
      sQ = sQ.eq("created_by", uid);
      cQ = cQ.eq("created_by", uid);
    }
    const [{ data: s }, { data: c }] = await Promise.all([sQ, cQ]);
    setSections((s as Section[]) || []);
    setCategories((c as Category[]) || []);
  };
  useEffect(() => { load(); }, [ownerOnly]);

  const filteredCategories = categories.filter((c) => c.section_id === sectionId);

  const createNew = async () => {
    const name = newName.trim();
    if (!name) return;
    if (!userId) { toast.error("Faça login para criar"); return; }

    if (creating === "section") {
      const { data, error } = await supabase
        .from("store_sections")
        .insert({ name, slug: slugify(name), pending: false, is_active: true, created_by: userId, sort_order: sections.length } as never)
        .select("id,name,pending,is_active")
        .single();
      if (error) { toast.error(error.message); return; }
      const row = data as Section;
      setSections((p) => [...p, row]);
      onChange({ section_id: row.id, category_id: null });
      toast.success("Seção criada");
    } else if (creating === "category" && sectionId) {
      const { data, error } = await supabase
        .from("store_categories")
        .insert({ section_id: sectionId, name, slug: slugify(name), pending: false, is_active: true, created_by: userId, sort_order: filteredCategories.length } as never)
        .select("id,section_id,name,pending,is_active")
        .single();
      if (error) { toast.error(error.message); return; }
      const row = data as Category;
      setCategories((p) => [...p, row]);
      onChange({ section_id: sectionId, category_id: row.id });
      toast.success("Categoria criada");
    }
    setNewName("");
    setCreating(null);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase text-white/50">Onde aparece na loja</p>

      <div>
        <label className="text-xs text-white/60">Seção</label>
        <div className="mt-1 flex gap-1.5">
          <select
            value={sectionId || ""}
            onChange={(e) => onChange({ section_id: e.target.value || null, category_id: null })}
            className="flex-1 rounded bg-black/40 border border-white/10 px-2 py-2 text-sm text-white"
          >
            <option value="">— escolher —</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.pending ? " (pendente)" : !s.is_active ? " (inativa)" : ""}</option>
            ))}
          </select>
          <button type="button" onClick={() => { setCreating("section"); setNewName(""); }} className="rounded bg-primary/15 text-primary px-2 py-2 text-xs font-semibold flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Nova
          </button>
        </div>
      </div>

      {sectionId && (
        <div>
          <label className="text-xs text-white/60">Subcategoria</label>
          <div className="mt-1 flex gap-1.5">
            <select
              value={categoryId || ""}
              onChange={(e) => onChange({ section_id: sectionId, category_id: e.target.value || null })}
              className="flex-1 rounded bg-black/40 border border-white/10 px-2 py-2 text-sm text-white"
            >
              <option value="">— escolher —</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.pending ? " (pendente)" : !c.is_active ? " (inativa)" : ""}</option>
              ))}
            </select>
            <button type="button" onClick={() => { setCreating("category"); setNewName(""); }} className="rounded bg-primary/15 text-primary px-2 py-2 text-xs font-semibold flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" /> Nova
            </button>
          </div>
        </div>
      )}

      {creating && (
        <div className="mt-2 rounded-lg border border-primary/40 bg-black/40 p-2 flex gap-1.5 items-center">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={creating === "section" ? "Nome da nova seção" : "Nome da nova subcategoria"}
            className="flex-1 rounded bg-black/40 border border-white/10 px-2 py-1.5 text-sm text-white"
          />
          <button type="button" onClick={createNew} className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Enviar</button>
          <button type="button" onClick={() => { setCreating(null); setNewName(""); }} className="text-white/50 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}

      <p className="text-[10px] text-white/40">Categorias novas ficam pendentes até o admin aprovar. O produto só aparece na loja quando ambos forem aprovados.</p>
    </div>
  );
}
