import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Trash2, Pencil, Save, X, Package, Image as ImageIcon, Upload, Star, Copy } from "lucide-react";
import { ProductFinancialEditor } from "./ProductFinancialEditor";
import { ProductDownloadsManager } from "./ProductDownloadsManager";

interface Section { id: string; name: string; }
interface Category { id: string; section_id: string; name: string; }
type Audience = "student" | "coach" | "partner" | "professional";
const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: "student", label: "Alunos" },
  { value: "coach", label: "Coaches" },
  { value: "partner", label: "Parceiros" },
  { value: "professional", label: "Profissionais" },
];

interface Item {
  id: string;
  section_id: string | null;
  category_id: string | null;
  kind: "physical" | "digital";
  name: string;
  description: string | null;
  short_description: string | null;
  image_url: string | null;
  price: number;
  original_price: number | null;
  stock: number | null;
  sku: string | null;
  is_featured: boolean;
  is_active: boolean;
  has_challenge_access?: boolean;
  challenge_tokens_amount?: number;
  sort_order: number;
  visibility_audiences?: Audience[] | null;
}

function emptyItem(): Partial<Item> {
  return {
    kind: "physical", name: "", description: "", short_description: "",
    price: 0, original_price: null, stock: null, sku: "",
    is_featured: false, is_active: true, sort_order: 0,
    visibility_audiences: null,
  };
}

export function StoreItemsManager() {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [filterSection, setFilterSection] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterKind, setFilterKind] = useState<string>("");
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [editTab, setEditTab] = useState<"general" | "financial">("general");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: c }, { data: i }] = await Promise.all([
      supabase.from("store_sections").select("id,name").order("sort_order"),
      supabase.from("store_categories").select("id,section_id,name").order("sort_order"),
      supabase
        .from("products")
        .select("id,section_id,category_id,kind,name,description,short_description,image_url,price,original_price,stock,sku,is_featured,is_active,has_challenge_access,challenge_tokens_amount,sort_order,visibility_audiences")
        .not("kind", "is", null)
        .order("sort_order"),
    ]);
    setSections((s as Section[]) || []);
    setCategories((c as Category[]) || []);
    setItems(((i as unknown) as Item[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filteredItems = items.filter((it) =>
    (!filterSection || it.section_id === filterSection) &&
    (!filterCategory || it.category_id === filterCategory) &&
    (!filterKind || it.kind === filterKind)
  );

  const handleUpload = async (file: File) => {
    if (!editing) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `items/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("store-images").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("store-images").getPublicUrl(path);
      setEditing({ ...editing, image_url: data.publicUrl });
    } catch (e: any) {
      alert("Erro ao enviar imagem: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing?.name || !editing?.section_id || !editing?.kind) {
      alert("Preencha nome, seção e tipo.");
      setEditTab("general");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        section_id: editing.section_id,
        category_id: editing.category_id || null,
        kind: editing.kind,
        name: editing.name,
        description: editing.description || null,
        short_description: editing.short_description || null,
        image_url: editing.image_url || null,
        price: Number(editing.price) || 0,
        original_price: editing.original_price ? Number(editing.original_price) : null,
        stock: editing.kind === "physical" && editing.stock !== null && editing.stock !== undefined ? Number(editing.stock) : null,
        sku: editing.sku || null,
        is_featured: !!editing.is_featured,
        is_active: !!editing.is_active,
        has_challenge_access: !!editing.has_challenge_access,
        challenge_tokens_amount: editing.has_challenge_access ? Math.max(0, Number(editing.challenge_tokens_amount ?? 1)) : 0,
        sort_order: Number(editing.sort_order) || 0,
        status: editing.is_active === false ? "inactive" : "active",
        visibility_audiences: (editing.visibility_audiences && editing.visibility_audiences.length > 0) ? editing.visibility_audiences : null,
      };
      if (editing.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase
          .from("products")
          .insert({ ...payload, type: "challenge", product_type: "plan_30" } as any)
          .select("id")
          .single();
        if (error) throw error;
        // Keep editing this newly created product so user can switch to Financeiro tab
        setEditing({ ...(editing as any), id: created.id });
        setEditTab("financial");
      }
      await load();
    } catch (e: any) {
      alert("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este item? Os slots financeiros vinculados também serão removidos.")) return;
    await supabase.from("product_value_slots").delete().eq("product_id", id);
    await supabase.from("products").delete().eq("id", id);
    load();
  };

  const toggleActive = async (it: Item) => {
    await supabase.from("products").update({ is_active: !it.is_active, status: !it.is_active ? "active" : "inactive" }).eq("id", it.id);
    load();
  };

  const duplicate = async (it: Item) => {
    if (!confirm(`Duplicar "${it.name}"? Uma cópia inativa será criada na mesma seção e categoria, com os mesmos dados básicos e financeiros. Pagamentos, vendas e pontos NÃO serão duplicados.`)) return;
    try {
      // 1) Buscar produto completo
      const { data: full, error: fErr } = await supabase.from("products").select("*").eq("id", it.id).maybeSingle();
      if (fErr) throw fErr;
      if (!full) throw new Error("Produto original não encontrado");
      const src = full as any;
      const { id: _oldId, created_at: _c, updated_at: _u, ...rest } = src;
      const insertPayload = {
        ...rest,
        name: `${src.name} (cópia)`,
        sku: src.sku ? `${src.sku}-COPIA` : null,
        is_active: false,
        is_featured: false,
        status: "inactive",
      };
      const { data: created, error: iErr } = await supabase
        .from("products")
        .insert(insertPayload as any)
        .select("id")
        .single();
      if (iErr) throw iErr;
      const newId = (created as any).id as string;

      // 2) Duplicar slots financeiros
      const { data: slots } = await supabase.from("product_value_slots").select("*").eq("product_id", it.id);
      if (slots && slots.length > 0) {
        const rows = (slots as any[]).map(({ id, created_at, updated_at, ...r }) => ({ ...r, product_id: newId }));
        const { error: sErr } = await supabase.from("product_value_slots").insert(rows as any);
        if (sErr) throw sErr;
      }

      // 3) Regras de indicação
      const { data: refRules } = await supabase.from("product_referral_rules").select("*").eq("product_id", it.id);
      if (refRules && refRules.length > 0) {
        const rows = (refRules as any[]).map(({ id, created_at, updated_at, ...r }) => ({ ...r, product_id: newId }));
        await supabase.from("product_referral_rules").insert(rows as any);
      }

      // 4) Requisitos de profissional
      const { data: profReq } = await supabase.from("product_professional_requirements").select("*").eq("product_id", it.id);
      if (profReq && profReq.length > 0) {
        const rows = (profReq as any[]).map(({ id, created_at, ...r }) => ({ ...r, product_id: newId }));
        await supabase.from("product_professional_requirements").insert(rows as any);
      }

      await load();
      alert("Produto duplicado! A cópia foi criada como inativa para você revisar antes de publicar.");
    } catch (e: any) {
      alert("Erro ao duplicar: " + (e?.message || e));
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const editingCategories = editing?.section_id
    ? categories.filter((c) => c.section_id === editing.section_id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Package className="h-6 w-6 text-primary" />Loja — Itens</h1>
          <p className="text-sm text-white/60 mt-1">Cadastre os produtos físicos e digitais da loja. A aba <strong>Financeiro</strong> abre a calculadora completa de slots, comissões paralelas e pontos.</p>
        </div>
        <button
          onClick={() => { setEditTab("general"); setEditing({ ...emptyItem(), section_id: sections[0]?.id }); }}
          disabled={sections.length === 0}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Novo item
        </button>
      </div>

      {sections.length === 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm text-yellow-200">
          Crie ao menos uma seção em <strong>Loja → Seções e Categorias</strong> antes de cadastrar itens.
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#0F0F0F] p-3">
        <select value={filterSection} onChange={(e) => { setFilterSection(e.target.value); setFilterCategory(""); }} className="input-dark">
          <option value="">Todas as seções</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input-dark">
          <option value="">Todas as categorias</option>
          {categories.filter((c) => !filterSection || c.section_id === filterSection).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} className="input-dark">
          <option value="">Todos os tipos</option>
          <option value="physical">Físico</option>
          <option value="digital">Digital</option>
        </select>
        <span className="ml-auto text-xs text-white/50">{filteredItems.length} item(ns)</span>
      </div>

      {/* Lista */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredItems.map((it) => {
          const sec = sections.find((s) => s.id === it.section_id);
          const cat = categories.find((c) => c.id === it.category_id);
          return (
            <div key={it.id} className={`rounded-xl border bg-[#0F0F0F] overflow-hidden ${it.is_active ? "border-white/10" : "border-white/5 opacity-60"}`}>
              <div className="aspect-video bg-black/40 relative">
                {it.image_url ? (
                  <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-white/20"><ImageIcon className="h-8 w-8" /></div>
                )}
                {it.is_featured && <span className="absolute top-2 left-2 flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground"><Star className="h-3 w-3" />Destaque</span>}
                <span className={`absolute top-2 right-2 rounded px-2 py-0.5 text-xs font-medium ${it.kind === "digital" ? "bg-blue-500/20 text-blue-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                  {it.kind === "digital" ? "Digital" : "Físico"}
                </span>
              </div>
              <div className="p-3 space-y-2">
                <div>
                  <div className="font-semibold text-white truncate">{it.name}</div>
                  <div className="text-xs text-white/40 truncate">{sec?.name}{cat ? ` · ${cat.name}` : ""}</div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-primary">R$ {Number(it.price).toFixed(2)}</span>
                  {it.original_price && Number(it.original_price) > Number(it.price) && (
                    <span className="text-xs text-white/40 line-through">R$ {Number(it.original_price).toFixed(2)}</span>
                  )}
                </div>
                {it.kind === "physical" && (
                  <div className="text-xs text-white/50">Estoque: {it.stock ?? "—"}</div>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setEditTab("general"); setEditing(it); }} className="flex-1 rounded-md bg-white/5 px-2 py-1.5 text-xs text-white/80 hover:bg-white/10 flex items-center justify-center gap-1"><Pencil className="h-3 w-3" />Editar</button>
                  <button onClick={() => duplicate(it)} title="Duplicar produto" className="rounded-md bg-white/5 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10 flex items-center justify-center gap-1"><Copy className="h-3 w-3" />Duplicar</button>
                  <button onClick={() => toggleActive(it)} className="rounded-md bg-white/5 px-2 py-1.5 text-xs text-white/70 hover:bg-white/10">{it.is_active ? "Desativar" : "Ativar"}</button>
                  <button onClick={() => remove(it.id)} className="rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/20"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            </div>
          );
        })}
        {filteredItems.length === 0 && sections.length > 0 && (
          <div className="col-span-full rounded-xl border border-white/10 bg-[#0F0F0F] p-8 text-center text-sm text-white/50">
            Nenhum item encontrado com os filtros atuais.
          </div>
        )}
      </div>

      {/* Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0F0F0F] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editing.id ? "Editar item" : "Novo item"}</h2>
              <button onClick={() => setEditing(null)} className="text-white/50 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex gap-2 border-b border-white/10">
              <button onClick={() => setEditTab("general")} className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${editTab === "general" ? "border-primary text-primary" : "border-transparent text-white/60 hover:text-white"}`}>Geral</button>
              <button
                onClick={() => editing.id ? setEditTab("financial") : alert("Salve a aba Geral primeiro para liberar a configuração financeira.")}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${editTab === "financial" ? "border-primary text-primary" : "border-transparent text-white/60 hover:text-white"} ${!editing.id ? "opacity-50" : ""}`}
                title={!editing.id ? "Salve o item primeiro" : ""}
              >
                Financeiro {!editing.id && "🔒"}
              </button>
            </div>

            {editTab === "general" && (<>
            {/* Imagem */}
            <div>
              <label className="text-xs text-white/60 mb-1 block">Imagem</label>
              <div className="flex items-center gap-3">
                <div className="h-24 w-24 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden">
                  {editing.image_url ? (
                    <img src={editing.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-white/20" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 cursor-pointer w-fit">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? "Enviando..." : "Enviar imagem"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                  </label>
                  <p className="text-[10px] text-white/40">Recomendado: 1080×1080px (1:1)</p>
                  {editing.image_url && (
                    <button onClick={() => setEditing({ ...editing, image_url: null })} className="text-xs text-red-400 hover:underline w-fit">Remover</button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs text-white/60 mb-1 block">Nome</label>
                <input className="input-dark w-full" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>

              <div>
                <label className="text-xs text-white/60 mb-1 block">Seção</label>
                <select className="input-dark w-full" value={editing.section_id || ""} onChange={(e) => setEditing({ ...editing, section_id: e.target.value, category_id: null })}>
                  <option value="">Selecione...</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">Categoria</label>
                <select className="input-dark w-full" value={editing.category_id || ""} onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}>
                  <option value="">Sem categoria</option>
                  {editingCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-white/60 mb-1 block">Tipo</label>
                <select className="input-dark w-full" value={editing.kind || "physical"} onChange={(e) => setEditing({ ...editing, kind: e.target.value as "physical" | "digital" })}>
                  <option value="physical">Físico</option>
                  <option value="digital">Digital</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">SKU (opcional)</label>
                <input className="input-dark w-full" value={editing.sku || ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} />
              </div>

              <div>
                <label className="text-xs text-white/60 mb-1 block">Preço (R$)</label>
                <input type="number" step="0.01" className="input-dark w-full" value={editing.price ?? 0} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-white/60 mb-1 block">Preço original (de) — opcional</label>
                <input type="number" step="0.01" className="input-dark w-full" value={editing.original_price ?? ""} onChange={(e) => setEditing({ ...editing, original_price: e.target.value ? Number(e.target.value) : null })} />
              </div>

              {editing.kind === "physical" && (
                <div>
                  <label className="text-xs text-white/60 mb-1 block">Estoque</label>
                  <input type="number" className="input-dark w-full" value={editing.stock ?? ""} onChange={(e) => setEditing({ ...editing, stock: e.target.value ? Number(e.target.value) : null })} />
                </div>
              )}
              <div>
                <label className="text-xs text-white/60 mb-1 block">Ordem</label>
                <input type="number" className="input-dark w-full" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-white/60 mb-1 block">Descrição curta</label>
                <input className="input-dark w-full" value={editing.short_description || ""} onChange={(e) => setEditing({ ...editing, short_description: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-white/60 mb-1 block">Descrição completa</label>
                <textarea rows={4} className="input-dark w-full" value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>

              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" checked={!!editing.is_featured} onChange={(e) => setEditing({ ...editing, is_featured: e.target.checked })} />
                Destaque
              </label>
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Ativo
              </label>
              <label className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" checked={!!editing.has_challenge_access} onChange={(e) => setEditing({ ...editing, has_challenge_access: e.target.checked, challenge_tokens_amount: e.target.checked ? (editing.challenge_tokens_amount ?? 1) : 0 })} /> Dá acesso ao Desafio
              </label>
              {editing.has_challenge_access && (
                <div className="md:col-span-2 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <label className="text-xs text-white/80 whitespace-nowrap">Tickets do desafio por compra</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="input-dark w-24"
                    value={editing.challenge_tokens_amount ?? 1}
                    onChange={(e) => setEditing({ ...editing, challenge_tokens_amount: Math.max(1, Number(e.target.value) || 1) })}
                  />
                  <span className="text-[11px] text-white/50">Quantos tickets o aluno recebe ao comprar este produto.</span>
                </div>
              )}

              <div className="md:col-span-2 rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/80">Quem pode ver este produto</span>
                  <span className="text-[10px] text-white/40">Nada marcado = visível para todos</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {AUDIENCE_OPTIONS.map((opt) => {
                    const current = editing.visibility_audiences || [];
                    const checked = current.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-2 text-sm text-white/80">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const set = new Set(current);
                            if (e.target.checked) set.add(opt.value); else set.delete(opt.value);
                            setEditing({ ...editing, visibility_audiences: Array.from(set) as Audience[] });
                          }}
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px] text-white/40">
                  Ex.: marque apenas <strong>Coaches</strong> para produtos que o coach vende diretamente ao aluno via link — o produto não aparecerá na loja do aluno, mas as comissões continuam sendo distribuídas normalmente.
                </p>
            </div>
            </div>

            {editing.id && (
              <ProductDownloadsManager productId={editing.id} />
            )}




            <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-white/60 hover:text-white">Cancelar</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editing.id ? "Salvar" : "Salvar e configurar financeiro"}
              </button>
            </div>
            </>)}

            {editTab === "financial" && editing.id && (
              <ProductFinancialEditor productId={editing.id} onSaved={load} />
            )}
          </div>
        </div>
      )}

      <style>{`
        .input-dark { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; outline: none; }
        .input-dark:focus { border-color: hsl(var(--primary)); }
        select.input-dark { background-color: #1a1a1a; }
        select.input-dark > option { background-color: #1a1a1a; color: white; }
      `}</style>
    </div>
  );
}
