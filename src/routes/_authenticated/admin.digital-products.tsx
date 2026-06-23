import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Edit, Library, Plus, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/digital-products")({
  component: AdminDigitalProducts,
});

interface DigitalProduct {
  id: string;
  type: string;
  title: string;
  description: string | null;
  instructor: string | null;
  cover_url: string | null;
  price: number;
  original_price: number | null;
  duration_hours: number | null;
  access_days: number | null;
  content_url: string | null;
  status: string | null;
  is_featured: boolean | null;
  sort_order: number | null;
}

function AdminDigitalProducts() {
  const [items, setItems] = useState<DigitalProduct[]>([]);
  const [editing, setEditing] = useState<DigitalProduct | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("digital_products").select("*").order("sort_order");
    setItems((data as DigitalProduct[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startNew = () => setEditing({
    id: "", type: "course", title: "", description: "", instructor: "FitMind Club", cover_url: "", price: 97,
    original_price: null, duration_hours: 1, access_days: 365, content_url: "", status: "active", is_featured: false, sort_order: items.length + 1,
  });

  const save = async () => {
    if (!editing || !editing.title.trim() || !editing.content_url?.trim()) return toast.error("Informe título e link de acesso.");
    const payload = { ...editing, price: Number(editing.price || 0), original_price: editing.original_price ? Number(editing.original_price) : null };
    const { id, ...insertPayload } = payload;
    const { error } = id
      ? await supabase.from("digital_products").update(payload as never).eq("id", id)
      : await supabase.from("digital_products").insert(insertPayload as never);
    if (error) toast.error(error.message);
    else { toast.success("Produto digital salvo"); setEditing(null); load(); }
  };

  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (editing) return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{editing.id ? "Editar" : "Novo"} produto digital</h1>
        <div className="flex gap-2">
          <button onClick={() => setEditing(null)} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm text-white"><X className="h-4 w-4" /> Cancelar</button>
          <button onClick={save} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><Save className="h-4 w-4" /> Salvar</button>
        </div>
      </div>
      <div className="rounded-2xl border border-white/5 bg-card p-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Título"><Input value={editing.title} onChange={(v) => setEditing({ ...editing, title: v })} /></Field>
          <Field label="Instrutor"><Input value={editing.instructor || ""} onChange={(v) => setEditing({ ...editing, instructor: v })} /></Field>
          <Field label="Preço"><Input type="number" value={editing.price} onChange={(v) => setEditing({ ...editing, price: Number(v) })} /></Field>
          <Field label="Preço original"><Input type="number" value={editing.original_price || ""} onChange={(v) => setEditing({ ...editing, original_price: v ? Number(v) : null })} /></Field>
          <Field label="Horas de conteúdo"><Input type="number" value={editing.duration_hours || ""} onChange={(v) => setEditing({ ...editing, duration_hours: v ? Number(v) : null })} /></Field>
          <Field label="Dias de acesso"><Input type="number" value={editing.access_days || 365} onChange={(v) => setEditing({ ...editing, access_days: Number(v) })} /></Field>
          <Field label="Link da capa"><Input value={editing.cover_url || ""} onChange={(v) => setEditing({ ...editing, cover_url: v })} /></Field>
          <Field label="Link de acesso"><Input value={editing.content_url || ""} onChange={(v) => setEditing({ ...editing, content_url: v })} /></Field>
          <Field label="Status"><select value={editing.status || "active"} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className="field-control"><option value="active">Ativo</option><option value="inactive">Inativo</option></select></Field>
          <label className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2 text-sm text-white"><input type="checkbox" checked={!!editing.is_featured} onChange={(e) => setEditing({ ...editing, is_featured: e.target.checked })} className="h-4 w-4 accent-primary" /> Produto em destaque</label>
        </div>
        <Field label="Descrição"><textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={4} className="field-control mt-1" /></Field>
      </div>
    </>
  );

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white">Produtos digitais</h1><p className="text-sm text-white/50">Cursos, aulas gravadas e links liberados após pagamento</p></div>
        <button onClick={startNew} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><Plus className="h-4 w-4" /> Novo</button>
      </div>
      {loading ? <p className="text-white/50">Carregando...</p> : items.length === 0 ? (
        <div className="rounded-2xl bg-card p-12 text-center"><Library className="mx-auto mb-3 h-10 w-10 text-white/20" /><p className="text-white/50">Nenhum produto digital cadastrado.</p></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-white/5 bg-card p-5">
            <div className="mb-3 flex items-start justify-between"><div><h3 className="text-sm font-bold text-white">{item.title}</h3><p className="text-[11px] text-white/40">{item.instructor || "FitMind Club"}</p></div><span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{item.status}</span></div>
            <p className="mb-1 text-2xl font-bold text-primary">{fmt(Number(item.price || 0))}</p><p className="mb-3 text-[11px] text-white/40">{item.duration_hours || 0}h · {item.access_days || 365} dias de acesso</p>
            <button onClick={() => setEditing(item)} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-white"><Edit className="h-3.5 w-3.5" /> Editar</button>
          </div>
        ))}</div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] text-white/60">{label}</span>{children}</label>; }
function Input({ value, onChange, type = "text" }: { value: string | number; onChange: (v: string) => void; type?: string }) { return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="field-control" />; }