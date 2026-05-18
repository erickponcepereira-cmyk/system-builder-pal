import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Dumbbell, Video, Image as ImageIcon, Film, X } from "lucide-react";

export const Route = createFileRoute("/admin/library")({
  head: () => ({
    meta: [
      { title: "Biblioteca de Exercícios — Admin" },
      { name: "description", content: "Gerencie a biblioteca de exercícios." },
    ],
  }),
  component: AdminLibraryPage,
});

type MediaType = "video" | "gif" | "image";
interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  difficulty: string | null;
  description: string | null;
  media_type: MediaType;
  video_url: string | null;
  gif_url: string | null;
  image_url: string | null;
  is_global: boolean;
}

interface FormState {
  name: string;
  muscle_group: string;
  equipment: string;
  difficulty: string;
  description: string;
  media_type: MediaType;
  video_url: string;
  gif_url: string;
  image_url: string;
  is_global: boolean;
}
const empty: FormState = {
  name: "", muscle_group: "", equipment: "", difficulty: "iniciante", description: "",
  media_type: "video", video_url: "", gif_url: "", image_url: "", is_global: true,
};

function MediaPreview({ ex }: { ex: Exercise }) {
  if (ex.media_type === "video" && ex.video_url) {
    // YouTube embed if possible
    const ytMatch = ex.video_url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    if (ytMatch) {
      return (
        <iframe
          src={`https://www.youtube.com/embed/${ytMatch[1]}`}
          className="h-40 w-full rounded-lg"
          allowFullScreen
          title={ex.name}
        />
      );
    }
    return <video src={ex.video_url} controls className="h-40 w-full rounded-lg bg-black" />;
  }
  if (ex.media_type === "gif" && ex.gif_url) {
    return <img src={ex.gif_url} alt={ex.name} className="h-40 w-full rounded-lg object-cover" />;
  }
  if (ex.media_type === "image" && ex.image_url) {
    return <img src={ex.image_url} alt={ex.name} className="h-40 w-full rounded-lg object-cover" />;
  }
  return (
    <div className="flex h-40 w-full items-center justify-center rounded-lg bg-white/5 text-white/30">
      <Dumbbell className="h-10 w-10" />
    </div>
  );
}

function AdminLibraryPage() {
  const [list, setList] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("exercise_library")
      .select("id,name,muscle_group,equipment,difficulty,description,media_type,video_url,gif_url,image_url,is_global")
      .order("name");
    if (error) toast.error(error.message);
    setList((data as Exercise[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(empty); setShowForm(true); };
  const openEdit = (ex: Exercise) => {
    setEditing(ex);
    setForm({
      name: ex.name, muscle_group: ex.muscle_group || "", equipment: ex.equipment || "",
      difficulty: ex.difficulty || "iniciante", description: ex.description || "",
      media_type: ex.media_type, video_url: ex.video_url || "", gif_url: ex.gif_url || "",
      image_url: ex.image_url || "", is_global: ex.is_global,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nome obrigatório"); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      muscle_group: form.muscle_group || null,
      equipment: form.equipment || null,
      difficulty: form.difficulty || null,
      description: form.description || null,
      media_type: form.media_type,
      video_url: form.media_type === "video" ? (form.video_url || null) : null,
      gif_url: form.media_type === "gif" ? (form.gif_url || null) : null,
      image_url: form.media_type === "image" ? (form.image_url || null) : null,
      is_global: form.is_global,
    };
    const { error } = editing
      ? await supabase.from("exercise_library").update(payload).eq("id", editing.id)
      : await supabase.from("exercise_library").insert(payload as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Exercício atualizado" : "Exercício criado");
    setShowForm(false);
    load();
  };

  const remove = async (ex: Exercise) => {
    if (!confirm(`Excluir "${ex.name}"?`)) return;
    const { error } = await supabase.from("exercise_library").delete().eq("id", ex.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído");
    load();
  };

  const filtered = list.filter((e) =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.muscle_group || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl text-white">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Biblioteca de Exercícios</h1>
          <p className="text-sm text-white/60">Cadastre exercícios com vídeo, GIF ou imagem para uso dos coaches.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo exercício
        </button>
      </header>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nome ou grupo muscular..."
        className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder:text-white/30"
      />

      {loading ? (
        <p className="text-sm text-white/60">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">
          Nenhum exercício cadastrado ainda.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ex) => (
            <div key={ex.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <MediaPreview ex={ex} />
              <div className="mt-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold">{ex.name}</h3>
                  <p className="text-xs text-white/50">{ex.muscle_group || "—"} · {ex.equipment || "Livre"}</p>
                </div>
                <span className="flex items-center gap-1 rounded bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {ex.media_type === "video" && <Video className="h-3 w-3" />}
                  {ex.media_type === "gif" && <Film className="h-3 w-3" />}
                  {ex.media_type === "image" && <ImageIcon className="h-3 w-3" />}
                  {ex.media_type}
                </span>
              </div>
              {ex.description && <p className="mt-2 line-clamp-2 text-xs text-white/60">{ex.description}</p>}
              <div className="mt-3 flex gap-2">
                <button onClick={() => openEdit(ex)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/10 px-2 py-1.5 text-xs hover:bg-white/20">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button onClick={() => remove(ex)} className="flex items-center justify-center rounded-lg bg-red-500/15 px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/25">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0F0F0F] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing ? "Editar exercício" : "Novo exercício"}</h2>
              <button onClick={() => setShowForm(false)} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/60">Nome *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/60">Grupo muscular</label>
                  <input value={form.muscle_group} onChange={(e) => setForm({ ...form, muscle_group: e.target.value })} placeholder="ex: Peito" className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-white/60">Equipamento</label>
                  <input value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} placeholder="ex: Halteres" className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="text-xs text-white/60">Dificuldade</label>
                <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <option value="iniciante">Iniciante</option>
                  <option value="intermediario">Intermediário</option>
                  <option value="avancado">Avançado</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-white/60">Descrição / instruções</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="mb-2 block text-xs text-white/60">Tipo de mídia</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["video", "gif", "image"] as MediaType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, media_type: t })}
                      className={`flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        form.media_type === t ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-white/60 hover:text-white"
                      }`}
                    >
                      {t === "video" && <Video className="h-3.5 w-3.5" />}
                      {t === "gif" && <Film className="h-3.5 w-3.5" />}
                      {t === "image" && <ImageIcon className="h-3.5 w-3.5" />}
                      {t === "video" ? "Vídeo" : t === "gif" ? "GIF" : "Imagem"}
                    </button>
                  ))}
                </div>
              </div>

              {form.media_type === "video" && (
                <div>
                  <label className="text-xs text-white/60">Link do vídeo (YouTube ou MP4)</label>
                  <input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
                </div>
              )}
              {form.media_type === "gif" && (
                <div>
                  <label className="text-xs text-white/60">URL do GIF</label>
                  <input value={form.gif_url} onChange={(e) => setForm({ ...form, gif_url: e.target.value })} placeholder="https://.../exercicio.gif" className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
                </div>
              )}
              {form.media_type === "image" && (
                <div>
                  <label className="text-xs text-white/60">URL da imagem</label>
                  <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://.../exercicio.jpg" className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={form.is_global} onChange={(e) => setForm({ ...form, is_global: e.target.checked })} />
                Visível para todos os coaches (global)
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">Cancelar</button>
              <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {saving ? "Salvando..." : editing ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
