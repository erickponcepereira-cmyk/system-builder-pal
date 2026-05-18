import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, ListPlus, Dumbbell, Loader2 } from "lucide-react";

export type WorkoutTemplateItem = { name: string; sets: string; reps: string; rest: string; notes: string };
export type WorkoutTemplate = {
  id: string;
  name: string;
  description: string | null;
  goal: "hypertrophy" | "adaptation" | "weight_loss" | "general" | "other";
  level: "iniciante" | "intermediario" | "avancado" | null;
  items: WorkoutTemplateItem[];
  is_global: boolean;
  created_by_coach_id: string | null;
  is_active: boolean;
};

export const GOAL_LABELS: Record<WorkoutTemplate["goal"], string> = {
  hypertrophy: "Hipertrofia",
  adaptation: "Adaptação",
  weight_loss: "Perda de peso",
  general: "Geral",
  other: "Outro",
};

interface Props {
  /** "admin" creates global templates; "coach" creates personal ones for the given coach. */
  mode: "admin" | "coach";
  coachId?: string | null;
}

const EMPTY_ITEM = (): WorkoutTemplateItem => ({ name: "", sets: "", reps: "", rest: "", notes: "" });

export function WorkoutTemplatesPanel({ mode, coachId }: Props) {
  const [list, setList] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkoutTemplate | null>(null);
  const [filterGoal, setFilterGoal] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState<{
    name: string; description: string;
    goal: WorkoutTemplate["goal"]; level: WorkoutTemplate["level"];
    items: WorkoutTemplateItem[];
  }>({ name: "", description: "", goal: "general", level: "iniciante", items: [EMPTY_ITEM()] });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("workout_templates" as never)
      .select("*" as never)
      .order("is_global" as never, { ascending: false })
      .order("name" as never);
    if (error) toast.error(error.message);
    setList((data as unknown as WorkoutTemplate[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let l = list;
    if (mode === "coach") {
      // Coach view: show globals + own
      l = l.filter((t) => t.is_global || t.created_by_coach_id === coachId);
    } else {
      // Admin view: focus on global; allow toggling all
      l = l.filter((t) => t.is_global);
    }
    if (filterGoal !== "all") l = l.filter((t) => t.goal === filterGoal);
    if (search.trim()) {
      const q = search.toLowerCase();
      l = l.filter((t) => t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q));
    }
    return l;
  }, [list, mode, coachId, filterGoal, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", goal: "general", level: "iniciante", items: [EMPTY_ITEM()] });
    setShowForm(true);
  };
  const openEdit = (t: WorkoutTemplate) => {
    setEditing(t);
    setForm({
      name: t.name, description: t.description || "", goal: t.goal, level: t.level || "iniciante",
      items: t.items?.length ? t.items : [EMPTY_ITEM()],
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome do treino.");
    if (form.items.length === 0) return toast.error("Adicione pelo menos 1 exercício.");

    const items = form.items.filter((i) => i.name.trim());
    if (items.length === 0) return toast.error("Adicione pelo menos 1 exercício com nome.");

    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      goal: form.goal,
      level: form.level,
      items,
      is_global: mode === "admin",
      created_by_coach_id: mode === "coach" ? coachId : null,
    };

    const { error } = editing
      ? await supabase.from("workout_templates" as never).update(payload as never).eq("id" as never, editing.id as never)
      : await supabase.from("workout_templates" as never).insert(payload as never);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Treino atualizado" : "Treino criado");
    setShowForm(false); load();
  };

  const remove = async (t: WorkoutTemplate) => {
    if (!confirm(`Excluir "${t.name}"?`)) return;
    const { error } = await supabase.from("workout_templates" as never).delete().eq("id" as never, t.id as never);
    if (error) return toast.error(error.message);
    toast.success("Removido"); load();
  };

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, EMPTY_ITEM()] }));
  const updItem = (i: number, patch: Partial<WorkoutTemplateItem>) =>
    setForm((f) => ({ ...f, items: f.items.map((x, idx) => idx === i ? { ...x, ...patch } : x) }));
  const rmItem = (i: number) => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  return (
    <div className="space-y-4 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><Dumbbell className="h-5 w-5 text-primary" /> Treinos prontos</h2>
          <p className="text-xs text-white/60">{mode === "admin" ? "Templates globais disponíveis a todos os coaches." : "Templates globais + seus templates pessoais."}</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> Novo treino
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="flex-1 min-w-[180px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
        <select value={filterGoal} onChange={(e) => setFilterGoal(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
          <option value="all">Todos os objetivos</option>
          {Object.entries(GOAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-primary" /> :
       filtered.length === 0 ? <p className="rounded-xl bg-white/5 p-6 text-center text-sm text-white/50">Nenhum treino cadastrado.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const canEdit = mode === "admin" || t.created_by_coach_id === coachId;
            return (
              <div key={t.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold">{t.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">{GOAL_LABELS[t.goal]}</span>
                      {t.level && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">{t.level}</span>}
                      {t.is_global && <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-400">Global</span>}
                      {!t.is_global && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-400">Meu</span>}
                    </div>
                  </div>
                </div>
                {t.description && <p className="mt-2 line-clamp-2 text-xs text-white/60">{t.description}</p>}
                <p className="mt-2 text-[11px] text-white/40">{t.items?.length || 0} exercício{(t.items?.length || 0) !== 1 ? "s" : ""}</p>
                {canEdit && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => openEdit(t)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/10 px-2 py-1.5 text-xs"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                    <button onClick={() => remove(t)} className="rounded-lg bg-red-500/15 px-2 py-1.5 text-xs text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0F0F0F] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing ? "Editar treino" : "Novo treino"}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-white/60" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/60">Nome *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Treino A — Peito e tríceps" className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-white/60">Descrição</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/60">Objetivo</label>
                  <select value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value as WorkoutTemplate["goal"] })} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                    {Object.entries(GOAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/60">Nível</label>
                  <select value={form.level || ""} onChange={(e) => setForm({ ...form, level: (e.target.value || null) as WorkoutTemplate["level"] })} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                    <option value="iniciante">Iniciante</option>
                    <option value="intermediario">Intermediário</option>
                    <option value="avancado">Avançado</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs text-white/60">Exercícios ({form.items.length})</label>
                  <button onClick={addItem} className="flex items-center gap-1 rounded bg-primary/20 px-2 py-1 text-xs text-primary"><Plus className="h-3 w-3" /> Adicionar</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((it, i) => (
                    <div key={i} className="rounded-xl bg-white/5 p-3">
                      <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
                        <input value={it.name} onChange={(e) => updItem(i, { name: e.target.value })} placeholder="Nome do exercício" className="rounded bg-white/10 px-2 py-1.5 text-sm" />
                        <button onClick={() => rmItem(i)} className="rounded bg-red-500/10 px-2 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input value={it.sets} onChange={(e) => updItem(i, { sets: e.target.value })} placeholder="Séries" className="rounded bg-black/30 px-2 py-1.5 text-xs" />
                        <input value={it.reps} onChange={(e) => updItem(i, { reps: e.target.value })} placeholder="Reps" className="rounded bg-black/30 px-2 py-1.5 text-xs" />
                        <input value={it.rest} onChange={(e) => updItem(i, { rest: e.target.value })} placeholder="Descanso" className="rounded bg-black/30 px-2 py-1.5 text-xs" />
                      </div>
                      <input value={it.notes} onChange={(e) => updItem(i, { notes: e.target.value })} placeholder="Observações" className="mt-2 w-full rounded bg-black/30 px-2 py-1.5 text-xs" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="rounded-lg bg-white/10 px-4 py-2 text-sm">Cancelar</button>
              <button onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><ListPlus className="inline h-4 w-4 mr-1" /> {editing ? "Salvar" : "Criar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
