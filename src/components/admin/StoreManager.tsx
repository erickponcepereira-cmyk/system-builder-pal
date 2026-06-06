import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Trash2, Pencil, Save, X, ChevronDown, ChevronRight, FolderTree, CheckCircle2 } from "lucide-react";

interface Section {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  card_width: number | null;
  card_height: number | null;
  pending?: boolean | null;
  target_audience?: string | null;
}
interface Category {
  id: string;
  section_id: string;
  name: string;
  slug: string;
  icon: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  card_width: number | null;
  card_height: number | null;
  pending?: boolean | null;
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function StoreManager() {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [draftSection, setDraftSection] = useState<Partial<Section>>({});
  const [draftCategory, setDraftCategory] = useState<Partial<Category>>({});
  const [newSection, setNewSection] = useState<Partial<Section> | null>(null);
  const [newCategoryFor, setNewCategoryFor] = useState<string | null>(null);
  const [newCategoryDraft, setNewCategoryDraft] = useState<Partial<Category>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("store_sections").select("*").order("sort_order"),
      supabase.from("store_categories").select("*").order("sort_order"),
    ]);
    setSections((s as Section[]) || []);
    setCategories((c as Category[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveSection = async (id: string) => {
    const payload: any = { ...draftSection };
    if (payload.name) payload.slug = payload.slug || slugify(payload.name);
    await supabase.from("store_sections").update(payload).eq("id", id);
    setEditingSection(null);
    setDraftSection({});
    load();
  };
  const createSection = async () => {
    if (!newSection?.name) return;
    const payload = {
      name: newSection.name,
      slug: newSection.slug || slugify(newSection.name),
      icon: newSection.icon || null,
      image_url: newSection.image_url || null,
      sort_order: newSection.sort_order ?? sections.length,
      is_active: newSection.is_active ?? true,
      card_width: newSection.card_width ?? null,
      card_height: newSection.card_height ?? null,
    };
    await supabase.from("store_sections").insert(payload);
    setNewSection(null);
    load();
  };
  const deleteSection = async (id: string) => {
    if (!confirm("Excluir esta seção e todas as categorias dentro dela?")) return;
    await supabase.from("store_sections").delete().eq("id", id);
    load();
  };

  const saveCategory = async (id: string) => {
    const payload: any = { ...draftCategory };
    if (payload.name) payload.slug = payload.slug || slugify(payload.name);
    await supabase.from("store_categories").update(payload).eq("id", id);
    setEditingCategory(null);
    setDraftCategory({});
    load();
  };
  const createCategory = async (sectionId: string) => {
    if (!newCategoryDraft?.name) return;
    await supabase.from("store_categories").insert({
      section_id: sectionId,
      name: newCategoryDraft.name,
      slug: newCategoryDraft.slug || slugify(newCategoryDraft.name),
      icon: newCategoryDraft.icon || null,
      image_url: newCategoryDraft.image_url || null,
      sort_order: newCategoryDraft.sort_order ?? 0,
      is_active: newCategoryDraft.is_active ?? true,
      card_width: newCategoryDraft.card_width ?? null,
      card_height: newCategoryDraft.card_height ?? null,
    });
    setNewCategoryFor(null);
    setNewCategoryDraft({});
    load();
  };
  const deleteCategory = async (id: string) => {
    if (!confirm("Excluir esta categoria?")) return;
    await supabase.from("store_categories").delete().eq("id", id);
    load();
  };

  const approveSection = async (id: string) => {
    await supabase.from("store_sections").update({ pending: false, is_active: true }).eq("id", id);
    load();
  };
  const approveCategory = async (id: string) => {
    await supabase.from("store_categories").update({ pending: false, is_active: true }).eq("id", id);
    load();
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><FolderTree className="h-6 w-6 text-primary" />Loja — Seções e Categorias</h1>
          <p className="text-sm text-white/60 mt-1">Organize a estrutura da loja antes de cadastrar itens.</p>
        </div>
        <button
          onClick={() => setNewSection({ name: "", slug: "", icon: "", sort_order: sections.length, is_active: true })}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nova seção
        </button>
      </div>

      {(() => {
        const pendingSecs = sections.filter((s) => s.pending);
        const pendingCats = categories.filter((c) => c.pending);
        if (pendingSecs.length === 0 && pendingCats.length === 0) return null;
        return (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-4 space-y-2">
            <h2 className="text-sm font-bold text-yellow-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Aprovações pendentes ({pendingSecs.length + pendingCats.length})
            </h2>
            <p className="text-[11px] text-yellow-200/70">
              Categorias e subcategorias criadas por parceiros e profissionais. Aprove para liberar a exibição na loja.
            </p>
            <div className="space-y-1.5">
              {pendingSecs.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2 text-sm">
                  <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-300">Seção</span>
                  <span className="flex-1 text-white truncate">{s.name}</span>
                  <button onClick={() => approveSection(s.id)} className="flex items-center gap-1 rounded bg-green-500/15 px-3 py-1 text-[11px] font-bold text-green-400 hover:bg-green-500/25">
                    <CheckCircle2 className="h-3 w-3" /> Aprovar
                  </button>
                  <button onClick={() => deleteSection(s.id)} className="flex items-center gap-1 rounded bg-red-500/15 px-3 py-1 text-[11px] font-bold text-red-400 hover:bg-red-500/25">
                    <Trash2 className="h-3 w-3" /> Rejeitar
                  </button>
                </div>
              ))}
              {pendingCats.map((c) => {
                const parent = sections.find((s) => s.id === c.section_id);
                return (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2 text-sm">
                    <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-300">Subcategoria</span>
                    <span className="flex-1 text-white truncate">{c.name} <span className="text-white/40 text-xs">em {parent?.name || "—"}</span></span>
                    <button onClick={() => approveCategory(c.id)} className="flex items-center gap-1 rounded bg-green-500/15 px-3 py-1 text-[11px] font-bold text-green-400 hover:bg-green-500/25">
                      <CheckCircle2 className="h-3 w-3" /> Aprovar
                    </button>
                    <button onClick={() => deleteCategory(c.id)} className="flex items-center gap-1 rounded bg-red-500/15 px-3 py-1 text-[11px] font-bold text-red-400 hover:bg-red-500/25">
                      <Trash2 className="h-3 w-3" /> Rejeitar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {newSection && (
        <div className="rounded-xl border border-primary/40 bg-[#0F0F0F] p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <input className="input-dark md:col-span-2" placeholder="Nome da seção" value={newSection.name || ""} onChange={(e) => setNewSection({ ...newSection, name: e.target.value })} />
            <input className="input-dark" placeholder="slug (auto)" value={newSection.slug || ""} onChange={(e) => setNewSection({ ...newSection, slug: e.target.value })} />
            <input className="input-dark" placeholder="ícone (lucide name)" value={newSection.icon || ""} onChange={(e) => setNewSection({ ...newSection, icon: e.target.value })} />
            <input className="input-dark md:col-span-2" placeholder="URL da imagem (opcional)" value={newSection.image_url || ""} onChange={(e) => setNewSection({ ...newSection, image_url: e.target.value })} />
            <input type="number" className="input-dark" placeholder="largura px (ex: 160)" value={newSection.card_width ?? ""} onChange={(e) => setNewSection({ ...newSection, card_width: e.target.value ? Number(e.target.value) : null })} />
            <input type="number" className="input-dark" placeholder="altura px (ex: 160)" value={newSection.card_height ?? ""} onChange={(e) => setNewSection({ ...newSection, card_height: e.target.value ? Number(e.target.value) : null })} />
            {newSection.image_url && <img src={newSection.image_url} alt="" className="h-12 w-12 rounded-lg object-cover border border-white/10" />}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setNewSection(null)} className="px-3 py-1.5 text-sm text-white/60 hover:text-white">Cancelar</button>
            <button onClick={createSection} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"><Save className="h-3.5 w-3.5" />Salvar</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sections.length === 0 && !newSection && (
          <div className="rounded-xl border border-white/10 bg-[#0F0F0F] p-8 text-center text-white/50 text-sm">
            Nenhuma seção cadastrada ainda.
          </div>
        )}
        {sections.map((s) => {
          const isEditing = editingSection === s.id;
          const cats = categories.filter((c) => c.section_id === s.id).sort((a, b) => a.sort_order - b.sort_order);
          const open = expanded[s.id] ?? true;
          return (
            <div key={s.id} className="rounded-xl border border-white/10 bg-[#0F0F0F] overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <button onClick={() => setExpanded({ ...expanded, [s.id]: !open })} className="text-white/60 hover:text-white">
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {isEditing ? (
                  <>
                    <input className="input-dark flex-1" value={draftSection.name ?? s.name} onChange={(e) => setDraftSection({ ...draftSection, name: e.target.value })} />
                    <input className="input-dark w-32" value={draftSection.slug ?? s.slug} onChange={(e) => setDraftSection({ ...draftSection, slug: e.target.value })} />
                    <input className="input-dark w-48" placeholder="URL da imagem" value={draftSection.image_url ?? s.image_url ?? ""} onChange={(e) => setDraftSection({ ...draftSection, image_url: e.target.value })} />
                    <input type="number" className="input-dark w-20" placeholder="larg" value={draftSection.card_width ?? s.card_width ?? ""} onChange={(e) => setDraftSection({ ...draftSection, card_width: e.target.value ? Number(e.target.value) : null })} />
                    <input type="number" className="input-dark w-20" placeholder="alt" value={draftSection.card_height ?? s.card_height ?? ""} onChange={(e) => setDraftSection({ ...draftSection, card_height: e.target.value ? Number(e.target.value) : null })} />
                    <input type="number" className="input-dark w-16" value={draftSection.sort_order ?? s.sort_order} onChange={(e) => setDraftSection({ ...draftSection, sort_order: Number(e.target.value) })} />
                    <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={draftSection.is_active ?? s.is_active} onChange={(e) => setDraftSection({ ...draftSection, is_active: e.target.checked })} />Ativo</label>
                    <button onClick={() => saveSection(s.id)} className="rounded-lg bg-primary p-2 text-primary-foreground"><Save className="h-4 w-4" /></button>
                    <button onClick={() => { setEditingSection(null); setDraftSection({}); }} className="rounded-lg bg-white/5 p-2 text-white/60"><X className="h-4 w-4" /></button>
                  </>
                ) : (
                  <>
                    {s.image_url ? (
                      <img src={s.image_url} alt="" className="h-10 w-10 rounded-lg object-cover border border-white/10" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-white/5 border border-white/10" />
                    )}
                    <div className="flex-1">
                      <div className="font-semibold text-white flex items-center gap-2">
                        {s.name}
                        {s.pending && <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-300">Pendente</span>}
                      </div>
                      <div className="text-xs text-white/40">/{s.slug} · ordem {s.sort_order} · {s.is_active ? "ativa" : "inativa"} · {cats.length} categoria(s)</div>
                    </div>
                    {s.pending && (
                      <button onClick={() => approveSection(s.id)} className="flex items-center gap-1 rounded-lg bg-green-500/15 px-3 py-2 text-xs font-bold text-green-400 hover:bg-green-500/25">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
                      </button>
                    )}
                    <button onClick={() => { setEditingSection(s.id); setDraftSection(s); }} className="rounded-lg bg-white/5 p-2 text-white/70 hover:text-white"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => deleteSection(s.id)} className="rounded-lg bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>

              {open && (
                <div className="border-t border-white/5 bg-black/20 p-4 space-y-2">
                  {cats.map((c) => {
                    const isCatEditing = editingCategory === c.id;
                    return (
                      <div key={c.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                        {isCatEditing ? (
                          <>
                            <input className="input-dark flex-1" value={draftCategory.name ?? c.name} onChange={(e) => setDraftCategory({ ...draftCategory, name: e.target.value })} />
                            <input className="input-dark w-28" value={draftCategory.slug ?? c.slug} onChange={(e) => setDraftCategory({ ...draftCategory, slug: e.target.value })} />
                            <input className="input-dark w-40" placeholder="URL imagem" value={draftCategory.image_url ?? c.image_url ?? ""} onChange={(e) => setDraftCategory({ ...draftCategory, image_url: e.target.value })} />
                            <input type="number" className="input-dark w-16" placeholder="larg" value={draftCategory.card_width ?? c.card_width ?? ""} onChange={(e) => setDraftCategory({ ...draftCategory, card_width: e.target.value ? Number(e.target.value) : null })} />
                            <input type="number" className="input-dark w-16" placeholder="alt" value={draftCategory.card_height ?? c.card_height ?? ""} onChange={(e) => setDraftCategory({ ...draftCategory, card_height: e.target.value ? Number(e.target.value) : null })} />
                            <input type="number" className="input-dark w-16" value={draftCategory.sort_order ?? c.sort_order} onChange={(e) => setDraftCategory({ ...draftCategory, sort_order: Number(e.target.value) })} />
                            <label className="flex items-center gap-1.5 text-xs text-white/70"><input type="checkbox" checked={draftCategory.is_active ?? c.is_active} onChange={(e) => setDraftCategory({ ...draftCategory, is_active: e.target.checked })} />Ativa</label>
                            <button onClick={() => saveCategory(c.id)} className="rounded-md bg-primary p-1.5 text-primary-foreground"><Save className="h-3.5 w-3.5" /></button>
                            <button onClick={() => { setEditingCategory(null); setDraftCategory({}); }} className="rounded-md bg-white/5 p-1.5 text-white/60"><X className="h-3.5 w-3.5" /></button>
                          </>
                        ) : (
                          <>
                            {c.image_url ? (
                              <img src={c.image_url} alt="" className="h-8 w-8 rounded-md object-cover border border-white/10" />
                            ) : (
                              <div className="h-8 w-8 rounded-md bg-white/5 border border-white/10" />
                            )}
                            <div className="flex-1 text-sm text-white flex items-center gap-2">
                              {c.name}
                              {c.pending && <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-300">Pendente</span>}
                              <span className="text-xs text-white/40">/{c.slug} · ordem {c.sort_order} · {c.is_active ? "ativa" : "inativa"}</span>
                            </div>
                            {c.pending && (
                              <button onClick={() => approveCategory(c.id)} className="flex items-center gap-1 rounded-md bg-green-500/15 px-2 py-1.5 text-[11px] font-bold text-green-400 hover:bg-green-500/25">
                                <CheckCircle2 className="h-3 w-3" /> Aprovar
                              </button>
                            )}
                            <button onClick={() => { setEditingCategory(c.id); setDraftCategory(c); }} className="rounded-md bg-white/5 p-1.5 text-white/70 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => deleteCategory(c.id)} className="rounded-md bg-red-500/10 p-1.5 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                          </>
                        )}
                      </div>
                    );
                  })}

                  {newCategoryFor === s.id ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-black/30 px-3 py-2">
                      <input autoFocus className="input-dark flex-1 min-w-[150px]" placeholder="Nome da categoria" value={newCategoryDraft.name || ""} onChange={(e) => setNewCategoryDraft({ ...newCategoryDraft, name: e.target.value })} />
                      <input className="input-dark w-28" placeholder="slug" value={newCategoryDraft.slug || ""} onChange={(e) => setNewCategoryDraft({ ...newCategoryDraft, slug: e.target.value })} />
                      <input className="input-dark w-40" placeholder="URL imagem (opcional)" value={newCategoryDraft.image_url || ""} onChange={(e) => setNewCategoryDraft({ ...newCategoryDraft, image_url: e.target.value })} />
                      <input type="number" className="input-dark w-16" placeholder="larg" value={newCategoryDraft.card_width ?? ""} onChange={(e) => setNewCategoryDraft({ ...newCategoryDraft, card_width: e.target.value ? Number(e.target.value) : null })} />
                      <input type="number" className="input-dark w-16" placeholder="alt" value={newCategoryDraft.card_height ?? ""} onChange={(e) => setNewCategoryDraft({ ...newCategoryDraft, card_height: e.target.value ? Number(e.target.value) : null })} />
                      <input type="number" className="input-dark w-16" placeholder="ordem" value={newCategoryDraft.sort_order ?? cats.length} onChange={(e) => setNewCategoryDraft({ ...newCategoryDraft, sort_order: Number(e.target.value) })} />
                      <button onClick={() => createCategory(s.id)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Salvar</button>
                      <button onClick={() => { setNewCategoryFor(null); setNewCategoryDraft({}); }} className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-white/60">Cancelar</button>
                    </div>
                  ) : (
                    <button onClick={() => { setNewCategoryFor(s.id); setNewCategoryDraft({ sort_order: cats.length, is_active: true }); }} className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80">
                      <Plus className="h-3.5 w-3.5" /> Adicionar categoria
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .input-dark { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; outline: none; }
        .input-dark:focus { border-color: hsl(var(--primary)); }
      `}</style>
    </div>
  );
}
