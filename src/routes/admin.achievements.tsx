import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Save, Award, Pencil, X } from "lucide-react";

type Achievement = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  icon: string | null;
  condition_type: string;
  condition_value: number | null;
  sort_order: number;
  active: boolean;
};

const CONDITION_TYPES = [
  { value: "workouts_count", label: "Total de treinos concluídos" },
  { value: "streak_days", label: "Dias consecutivos (constância)" },
  { value: "personal_challenge_completed", label: "Desafio pessoal concluído" },
  { value: "manual", label: "Manual (concedido pelo coach/admin)" },
];

const EMPTY: Omit<Achievement, "id"> = {
  code: "",
  title: "",
  description: "",
  icon: "🏆",
  condition_type: "workouts_count",
  condition_value: 1,
  sort_order: 0,
  active: true,
};

function AdminAchievementsPage() {
  const [list, setList] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Achievement | null>(null);
  const [form, setForm] = useState<Omit<Achievement, "id">>(EMPTY);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("achievement_catalog" as never)
      .select("*" as never)
      .order("sort_order" as never)
      .order("title" as never);
    if (error) toast.error(error.message);
    setList((data as unknown as Achievement[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, sort_order: (list[list.length - 1]?.sort_order ?? 0) + 10 });
    setModalOpen(true);
  };

  const openEdit = (a: Achievement) => {
    setEditing(a);
    setForm({
      code: a.code,
      title: a.title,
      description: a.description || "",
      icon: a.icon || "🏆",
      condition_type: a.condition_type,
      condition_value: a.condition_value,
      sort_order: a.sort_order,
      active: a.active,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.title.trim()) {
      toast.error("Código e título são obrigatórios");
      return;
    }
    const payload = {
      code: form.code.trim(),
      title: form.title.trim(),
      description: form.description?.trim() || null,
      icon: form.icon?.trim() || null,
      condition_type: form.condition_type,
      condition_value: form.condition_value,
      sort_order: form.sort_order,
      active: form.active,
    };
    if (editing) {
      const { error } = await supabase.from("achievement_catalog" as never).update(payload as never).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Conquista atualizada");
    } else {
      const { error } = await supabase.from("achievement_catalog" as never).insert(payload as never);
      if (error) return toast.error(error.message);
      toast.success("Conquista criada");
    }
    setModalOpen(false);
    load();
  };

  const remove = async (a: Achievement) => {
    if (!confirm(`Excluir "${a.title}"?`)) return;
    const { error } = await supabase.from("achievement_catalog" as never).delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Conquista removida");
    load();
  };

  const toggleActive = async (a: Achievement) => {
    const { error } = await supabase.from("achievement_catalog" as never).update({ active: !a.active } as never).eq("id", a.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Award className="h-6 w-6 text-primary" /> Catálogo de Conquistas
          </h1>
          <p className="text-sm text-white/60">Gerencie as conquistas que os alunos podem desbloquear no app.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-black hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nova conquista
        </button>
      </div>

      <div className="rounded-2xl bg-[#1A1A1A] p-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-white/40">Carregando...</p>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/40">Nenhuma conquista cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {list.map((a) => (
              <div key={a.id} className={`flex items-center gap-3 rounded-xl border p-3 ${a.active ? "border-white/10 bg-white/[0.04]" : "border-white/5 bg-white/[0.02] opacity-60"}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xl">
                  {a.icon || "🏆"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-white">{a.title}</p>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">{a.code}</span>
                    {!a.active && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-400">inativa</span>}
                  </div>
                  <p className="truncate text-xs text-white/55">{a.description || "—"}</p>
                  <p className="mt-0.5 text-[10px] text-white/40">
                    {CONDITION_TYPES.find(c => c.value === a.condition_type)?.label || a.condition_type}
                    {a.condition_value != null ? ` · valor: ${a.condition_value}` : ""}
                    {` · ordem: ${a.sort_order}`}
                  </p>
                </div>
                <button onClick={() => toggleActive(a)} className="rounded bg-white/5 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10">
                  {a.active ? "Desativar" : "Ativar"}
                </button>
                <button onClick={() => openEdit(a)} className="rounded bg-white/5 p-2 text-white/70 hover:bg-white/10">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove(a)} className="rounded bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-[#1A1A1A] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editing ? "Editar conquista" : "Nova conquista"}</h2>
              <button onClick={() => setModalOpen(false)} className="rounded p-1 text-white/60 hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase text-white/50">Ícone</label>
                  <input value={form.icon || ""} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🏆" className="w-full rounded bg-black/30 px-2 py-1.5 text-center text-xl text-white outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase text-white/50">Código (único, sem espaços)</label>
                  <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\s+/g, "_").toLowerCase() })} placeholder="ex: first_workout" className="w-full rounded bg-black/30 px-2 py-1.5 text-sm text-white outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-white/50">Título</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Primeira vitória" className="w-full rounded bg-black/30 px-2 py-1.5 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase text-white/50">Descrição</label>
                <textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Concluiu seu primeiro treino" className="w-full rounded bg-black/30 px-2 py-1.5 text-sm text-white outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase text-white/50">Tipo de condição</label>
                  <select value={form.condition_type} onChange={(e) => setForm({ ...form, condition_type: e.target.value })} className="w-full rounded bg-black/30 px-2 py-1.5 text-sm text-white outline-none">
                    {CONDITION_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase text-white/50">Valor (meta)</label>
                  <input
                    type="number"
                    value={form.condition_value ?? ""}
                    onChange={(e) => setForm({ ...form, condition_value: e.target.value === "" ? null : Number(e.target.value) })}
                    placeholder="ex: 7"
                    className="w-full rounded bg-black/30 px-2 py-1.5 text-sm text-white outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase text-white/50">Ordem</label>
                  <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="w-full rounded bg-black/30 px-2 py-1.5 text-sm text-white outline-none" />
                </div>
                <div className="flex items-end">
                  <label className="flex w-full items-center gap-2 rounded bg-black/30 px-3 py-2 text-sm text-white">
                    <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-primary" />
                    Ativa
                  </label>
                </div>
              </div>
              <button onClick={save} className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-bold text-black hover:bg-primary/90">
                <Save className="h-4 w-4" /> {editing ? "Salvar alterações" : "Criar conquista"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/admin/achievements")({
  head: () => ({
    meta: [
      { title: "Conquistas — Admin FitMind" },
      { name: "description", content: "Catálogo de conquistas do app FitMind." },
    ],
  }),
  component: AdminAchievementsPage,
});
