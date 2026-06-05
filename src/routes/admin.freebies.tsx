import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Gift, Loader2, Image as ImageIcon, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/freebies")({
  head: () => ({ meta: [{ title: "Gratuitos — Admin" }] }),
  component: FreebiesAdmin,
});

type Freebie = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  kind: "physical" | "digital";
  stock: number | null;
  per_student_limit: number;
  valid_from: string | null;
  valid_until: string | null;
  condition_note: string | null;
  is_active: boolean;
  sort_order: number;
  category: string | null;
};

type Redemption = {
  id: string;
  status: string;
  created_at: string;
  delivered_at: string | null;
  freebies: { name: string } | null;
  students: { profiles: { name: string; email: string } | null } | null;
};

function FreebiesAdmin() {
  const [tab, setTab] = useState<"items" | "redemptions">("items");
  const [items, setItems] = useState<Freebie[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Freebie | null>(null);
  const [uploading, setUploading] = useState(false);

  const blank = (): Freebie => ({
    id: "", name: "", description: "", image_url: null, kind: "digital",
    stock: null, per_student_limit: 1, valid_from: null, valid_until: null,
    condition_note: "", is_active: true, sort_order: 0,
  });

  const load = async () => {
    setLoading(true);
    const [a, b] = await Promise.all([
      supabase.from("freebies" as never).select("*").order("sort_order").order("created_at" as never, { ascending: false }),
      supabase.from("freebie_redemptions" as never).select("id,status,created_at,delivered_at,freebies(name),students(profiles(name,email))" as never).order("created_at" as never, { ascending: false }).limit(100),
    ]);
    setItems((a.data as unknown as Freebie[]) || []);
    setRedemptions((b.data as unknown as Redemption[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Nome obrigatório"); return; }
    const payload = { ...editing };
    delete (payload as any).id;
    if (editing.id) {
      const { error } = await supabase.from("freebies" as never).update(payload as never).eq("id" as never, editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("freebies" as never).insert(payload as never);
      if (error) return toast.error(error.message);
    }
    toast.success("Salvo");
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este brinde?")) return;
    const { error } = await supabase.from("freebies" as never).delete().eq("id" as never, id);
    if (error) return toast.error(error.message);
    toast.success("Removido"); load();
  };

  const uploadImage = async (file: File) => {
    if (!editing) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `freebies/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("store-images").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("store-images").getPublicUrl(path);
    setEditing({ ...editing, image_url: data.publicUrl });
    setUploading(false);
  };

  const markDelivered = async (id: string) => {
    const { error } = await supabase.from("freebie_redemptions" as never)
      .update({ status: "delivered", delivered_at: new Date().toISOString() } as never)
      .eq("id" as never, id);
    if (error) return toast.error(error.message);
    toast.success("Marcado como entregue"); load();
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Gift className="h-6 w-6 text-primary" /> Gratuitos</h1>
          <p className="text-sm text-white/50">Brindes e itens com regras próprias de resgate</p>
        </div>
        {tab === "items" && (
          <button onClick={() => setEditing(blank())} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> Novo brinde
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-white/10 mb-5">
        <button onClick={() => setTab("items")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "items" ? "border-primary text-primary" : "border-transparent text-white/60"}`}>Itens</button>
        <button onClick={() => setTab("redemptions")} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "redemptions" ? "border-primary text-primary" : "border-transparent text-white/60"}`}>Resgates</button>
      </div>

      {loading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />}

      {!loading && tab === "items" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
              {it.image_url && <img src={it.image_url} alt={it.name} className="mb-2 h-32 w-full rounded object-cover" />}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">{it.name}</p>
                  <p className="text-[11px] text-white/50">{it.kind === "digital" ? "Digital" : "Físico"} · limite {it.per_student_limit} {it.stock !== null && `· estoque ${it.stock}`}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded ${it.is_active ? "bg-green-500/20 text-green-400" : "bg-white/5 text-white/40"}`}>
                  {it.is_active ? "Ativo" : "Inativo"}
                </span>
              </div>
              {it.description && <p className="mt-2 text-xs text-white/60 line-clamp-2">{it.description}</p>}
              <div className="mt-3 flex gap-2">
                <button onClick={() => setEditing(it)} className="flex-1 rounded bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 text-white">Editar</button>
                <button onClick={() => remove(it.id)} className="rounded bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-white/50 col-span-full">Nenhum brinde cadastrado.</p>}
        </div>
      )}

      {!loading && tab === "redemptions" && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          {redemptions.length === 0 ? (
            <p className="text-sm text-white/50">Nenhum resgate ainda.</p>
          ) : (
            <div className="space-y-2">
              {redemptions.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                  <div>
                    <p className="font-bold text-white">{r.freebies?.name || "—"}</p>
                    <p className="text-white/50">{r.students?.profiles?.name || "Aluno"} · {new Date(r.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${r.status === "delivered" ? "bg-green-500/20 text-green-400" : r.status === "cancelled" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>{r.status}</span>
                    {r.status === "pending" && (
                      <button onClick={() => markDelivered(r.id)} className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground">Entregar</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editing.id ? "Editar" : "Novo"} brinde</h2>
              <button onClick={() => setEditing(null)} className="text-white/60"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <Input label="Nome" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
              <div>
                <label className="text-xs text-white/60">Imagem</label>
                {editing.image_url ? (
                  <div className="relative mt-1">
                    <img src={editing.image_url} alt="" className="h-32 w-full rounded object-cover" />
                    <button onClick={() => setEditing({ ...editing, image_url: null })} className="absolute top-1 right-1 rounded bg-black/70 p-1"><X className="h-3 w-3 text-white" /></button>
                  </div>
                ) : (
                  <label className="mt-1 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed border-white/20 hover:bg-white/5">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <ImageIcon className="h-5 w-5 text-white/40" />}
                    <span className="text-[10px] text-white/40">Recomendado: 1080×1080px (1:1)</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
                  </label>
                )}
              </div>
              <div>
                <label className="text-xs text-white/60">Descrição</label>
                <textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="mt-1 w-full rounded bg-black/40 border border-white/10 px-3 py-2 text-white" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-white/60">Tipo</label>
                  <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as "physical" | "digital" })} className="mt-1 w-full rounded bg-black/40 border border-white/10 px-3 py-2 text-white">
                    <option value="digital">Digital</option>
                    <option value="physical">Físico</option>
                  </select>
                </div>
                <Input label="Limite por aluno" type="number" value={String(editing.per_student_limit)} onChange={(v) => setEditing({ ...editing, per_student_limit: Number(v) || 1 })} />
              </div>
              {editing.kind === "physical" && (
                <Input label="Estoque (vazio = ilimitado)" type="number" value={editing.stock?.toString() ?? ""} onChange={(v) => setEditing({ ...editing, stock: v === "" ? null : Number(v) })} />
              )}
              <div className="grid grid-cols-2 gap-2">
                <Input label="Válido de" type="datetime-local" value={editing.valid_from?.slice(0, 16) || ""} onChange={(v) => setEditing({ ...editing, valid_from: v ? new Date(v).toISOString() : null })} />
                <Input label="Válido até" type="datetime-local" value={editing.valid_until?.slice(0, 16) || ""} onChange={(v) => setEditing({ ...editing, valid_until: v ? new Date(v).toISOString() : null })} />
              </div>
              <Input label="Condição (opcional)" value={editing.condition_note || ""} onChange={(v) => setEditing({ ...editing, condition_note: v })} />
              <label className="flex items-center gap-2 text-white/80">
                <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Ativo
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded bg-white/5 px-4 py-2 text-sm text-white">Cancelar</button>
              <button onClick={save} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Save className="h-4 w-4" /> Salvar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs text-white/60">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded bg-black/40 border border-white/10 px-3 py-2 text-white" />
    </div>
  );
}
