import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Dumbbell, Pencil, Plus, Save, Trash2, X, Sparkles, Info } from "lucide-react";
import {
  enableTemplateForSelf,
  listWorkoutPlans,
  deleteWorkoutPlan,
  updatePlanExercise,
  deletePlanExercise,
  addPlanExercise,
} from "@/lib/workouts.functions";
import { WorkoutTemplatesPanel, type WorkoutTemplate } from "@/components/workouts/WorkoutTemplatesPanel";

type PlanExercise = {
  id: string;
  order_index: number;
  exercise_name: string;
  sets: number;
  reps: string | null;
  rest_seconds: number;
  rest_seconds_max: number | null;
  notes: string | null;
};

type Plan = {
  id: string;
  name: string;
  letter?: string | null;
  coach_id: string | null;
  student_id: string;
  workout_exercises: PlanExercise[];
};

const LETTER_COLORS: Record<string, string> = {
  A: "from-primary to-orange-500",
  B: "from-blue-500 to-cyan-400",
  C: "from-emerald-500 to-teal-400",
  D: "from-purple-500 to-pink-500",
  E: "from-yellow-500 to-amber-400",
};

function letterGradient(letter?: string | null) {
  return LETTER_COLORS[(letter || "").toUpperCase()] || "from-white/20 to-white/10";
}

export function StudentWorkoutBuilder({ studentUserId, onChanged }: { studentUserId: string; onChanged?: () => void }) {
  const listFn = useServerFn(listWorkoutPlans);
  const enableFn = useServerFn(enableTemplateForSelf);
  const deletePlanFn = useServerFn(deleteWorkoutPlan);
  const updateExFn = useServerFn(updatePlanExercise);
  const deleteExFn = useServerFn(deletePlanExercise);
  const addExFn = useServerFn(addPlanExercise);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingExId, setEditingExId] = useState<string | null>(null);
  const [exDraft, setExDraft] = useState<any>({});
  const [addingToPlanId, setAddingToPlanId] = useState<string | null>(null);
  const [newExDraft, setNewExDraft] = useState({ name: "", sets: 3, reps: "10-12", rest_seconds: 60, rest_seconds_max: null as number | null, notes: "" });

  const reload = async () => {
    try {
      const data = (await listFn({ data: {} })) as Plan[];
      data.forEach((p) => p.workout_exercises?.sort((a, b) => a.order_index - b.order_index));
      setPlans(data);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar treinos");
    }
  };

  useEffect(() => { reload(); }, []);

  // Only plans the student created themselves (coach_id === studentUserId)
  const myPlans = plans.filter((p) => p.coach_id === studentUserId);

  const handleEnable = async (t: WorkoutTemplate, letter: string) => {
    try {
      const r = (await enableFn({ data: { template_id: t.id, letter } })) as { plan_name: string };
      toast.success(`"${r.plan_name}" adicionado ao seu Meu Treino.`);
      await reload();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Erro ao adicionar treino");
    }
  };

  const removePlan = async (planId: string, name: string) => {
    if (!confirm(`Excluir treino "${name}"?`)) return;
    try {
      await deletePlanFn({ data: { id: planId } });
      toast.success("Treino removido");
      await reload();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir");
    }
  };

  const startEdit = (e: PlanExercise) => {
    setEditingExId(e.id);
    setExDraft({
      exercise_name: e.exercise_name,
      sets: e.sets ?? 3,
      reps: e.reps ?? "",
      rest_seconds: e.rest_seconds ?? 60,
      rest_seconds_max: e.rest_seconds_max ?? null,
      notes: e.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingExId) return;
    try {
      await updateExFn({ data: { exercise_id: editingExId, ...exDraft, reps: exDraft.reps || null, notes: exDraft.notes || null } });
      toast.success("Exercício atualizado");
      setEditingExId(null);
      await reload();
      onChanged?.();
    } catch (e: any) { toast.error(e.message || "Erro ao salvar"); }
  };

  const removeEx = async (id: string, name: string) => {
    if (!confirm(`Excluir exercício "${name}"?`)) return;
    try {
      await deleteExFn({ data: { exercise_id: id } });
      toast.success("Exercício removido");
      await reload();
      onChanged?.();
    } catch (e: any) { toast.error(e.message || "Erro ao excluir"); }
  };

  const submitAdd = async (planId: string) => {
    if (!newExDraft.name.trim()) { toast.error("Informe o nome do exercício"); return; }
    try {
      await addExFn({ data: {
        plan_id: planId,
        name: newExDraft.name.trim(),
        sets: newExDraft.sets,
        reps: newExDraft.reps || null,
        rest_seconds: newExDraft.rest_seconds,
        rest_seconds_max: newExDraft.rest_seconds_max,
        notes: newExDraft.notes || null,
      } });
      toast.success("Exercício adicionado");
      setAddingToPlanId(null);
      setNewExDraft({ name: "", sets: 3, reps: "10-12", rest_seconds: 60, rest_seconds_max: null, notes: "" });
      await reload();
      onChanged?.();
    } catch (e: any) { toast.error(e.message || "Erro ao adicionar"); }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-xs font-bold text-white">Monte seu próprio treino</p>
            <p className="mt-0.5 text-[11px] text-white/70">Escolha um treino pronto abaixo, selecione a letra (A, B, C, D ou E) e depois edite séries, adicione ou remova exercícios como preferir. Ele aparecerá em "Meu Treino" junto com os treinos do seu coach.</p>
          </div>
        </div>
      </div>

      {/* My self-built plans */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/70 flex items-center gap-2">
            <Dumbbell className="h-3.5 w-3.5 text-primary" /> Meus treinos montados
          </h3>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
            {myPlans.length} {myPlans.length === 1 ? "treino" : "treinos"}
          </span>
        </div>
        {myPlans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 py-6 text-center text-[11px] text-white/50 flex items-center justify-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Nenhum treino montado ainda. Escolha um "Treino pronto" abaixo para começar.
          </p>
        ) : (
          <div className="space-y-2">
            {myPlans.map((p) => {
              const isOpen = expanded.has(p.id);
              const L = (p.letter || "").toUpperCase();
              return (
                <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.04]">
                  <div className="flex items-center gap-2 p-3">
                    <button
                      onClick={() => setExpanded((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                      className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${letterGradient(L)} text-sm font-black text-white shadow`}>
                      {L || "·"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                      <p className="text-[10px] text-white/50">{p.workout_exercises.length} exercício{p.workout_exercises.length !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                      onClick={() => removePlan(p.id, p.name)}
                      className="rounded bg-red-500/10 px-2 py-1.5 text-red-400 hover:bg-red-500/20"
                      title="Excluir treino"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-white/5 px-3 py-2 space-y-1.5">
                      {p.workout_exercises.length === 0 && (
                        <p className="py-2 text-center text-[11px] text-white/40">Sem exercícios.</p>
                      )}
                      {p.workout_exercises.map((e, i) => {
                        const isEditing = editingExId === e.id;
                        return (
                          <div key={e.id} className="rounded bg-black/30 px-2 py-2 text-[11px] text-white/85">
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                {!isEditing ? (
                                  <>
                                    <p className="font-semibold text-white">{e.exercise_name}</p>
                                    <p className="text-white/55">
                                      {e.sets ? `${e.sets} séries` : ""}{e.reps ? ` · ${e.reps} reps` : ""}{e.rest_seconds ? ` · descanso ${e.rest_seconds}${e.rest_seconds_max && e.rest_seconds_max !== e.rest_seconds ? `–${e.rest_seconds_max}` : ""}s` : ""}
                                    </p>
                                    {e.notes && <p className="mt-0.5 text-white/45">{e.notes}</p>}
                                  </>
                                ) : (
                                  <div className="space-y-1.5">
                                    <input value={exDraft.exercise_name} onChange={(ev) => setExDraft({ ...exDraft, exercise_name: ev.target.value })} placeholder="Nome" className="w-full rounded bg-white/10 px-2 py-1 text-xs font-semibold text-white outline-none" />
                                    <div className="grid grid-cols-4 gap-1">
                                      <input type="number" value={exDraft.sets} onChange={(ev) => setExDraft({ ...exDraft, sets: Number(ev.target.value) })} placeholder="Séries" className="rounded bg-white/10 px-1.5 py-1 text-xs text-white outline-none" />
                                      <input value={exDraft.reps} onChange={(ev) => setExDraft({ ...exDraft, reps: ev.target.value })} placeholder="Reps" className="rounded bg-white/10 px-1.5 py-1 text-xs text-white outline-none" />
                                      <input type="number" value={exDraft.rest_seconds} onChange={(ev) => setExDraft({ ...exDraft, rest_seconds: Number(ev.target.value) })} placeholder="Desc min" className="rounded bg-white/10 px-1.5 py-1 text-xs text-white outline-none" />
                                      <input type="number" value={exDraft.rest_seconds_max ?? ""} onChange={(ev) => setExDraft({ ...exDraft, rest_seconds_max: ev.target.value === "" ? null : Number(ev.target.value) })} placeholder="Desc max" className="rounded bg-white/10 px-1.5 py-1 text-xs text-white outline-none" />
                                    </div>
                                    <input value={exDraft.notes} onChange={(ev) => setExDraft({ ...exDraft, notes: ev.target.value })} placeholder="Observações" className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white outline-none" />
                                  </div>
                                )}
                              </div>
                              <div className="flex shrink-0 gap-1">
                                {!isEditing ? (
                                  <>
                                    <button onClick={() => startEdit(e)} title="Editar" className="rounded bg-white/5 p-1 text-white/70 hover:bg-white/10"><Pencil className="h-3 w-3" /></button>
                                    <button onClick={() => removeEx(e.id, e.exercise_name)} title="Excluir" className="rounded bg-red-500/10 p-1 text-red-400 hover:bg-red-500/20"><Trash2 className="h-3 w-3" /></button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={saveEdit} title="Salvar" className="rounded bg-primary/20 p-1 text-primary hover:bg-primary/30"><Save className="h-3 w-3" /></button>
                                    <button onClick={() => setEditingExId(null)} title="Cancelar" className="rounded bg-white/5 p-1 text-white/70 hover:bg-white/10"><X className="h-3 w-3" /></button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {addingToPlanId === p.id ? (
                        <div className="rounded border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                          <input value={newExDraft.name} onChange={(ev) => setNewExDraft({ ...newExDraft, name: ev.target.value })} placeholder="Nome do exercício" className="w-full rounded bg-white/10 px-2 py-1 text-xs font-semibold text-white outline-none" />
                          <div className="grid grid-cols-4 gap-1">
                            <input type="number" value={newExDraft.sets} onChange={(ev) => setNewExDraft({ ...newExDraft, sets: Number(ev.target.value) })} placeholder="Séries" className="rounded bg-white/10 px-1.5 py-1 text-xs text-white outline-none" />
                            <input value={newExDraft.reps} onChange={(ev) => setNewExDraft({ ...newExDraft, reps: ev.target.value })} placeholder="Reps" className="rounded bg-white/10 px-1.5 py-1 text-xs text-white outline-none" />
                            <input type="number" value={newExDraft.rest_seconds} onChange={(ev) => setNewExDraft({ ...newExDraft, rest_seconds: Number(ev.target.value) })} placeholder="Desc min" className="rounded bg-white/10 px-1.5 py-1 text-xs text-white outline-none" />
                            <input type="number" value={newExDraft.rest_seconds_max ?? ""} onChange={(ev) => setNewExDraft({ ...newExDraft, rest_seconds_max: ev.target.value === "" ? null : Number(ev.target.value) })} placeholder="Desc max" className="rounded bg-white/10 px-1.5 py-1 text-xs text-white outline-none" />
                          </div>
                          <input value={newExDraft.notes} onChange={(ev) => setNewExDraft({ ...newExDraft, notes: ev.target.value })} placeholder="Observações" className="w-full rounded bg-white/10 px-2 py-1 text-xs text-white outline-none" />
                          <div className="flex gap-1">
                            <button onClick={() => submitAdd(p.id)} className="flex flex-1 items-center justify-center gap-1 rounded bg-primary px-2 py-1 text-xs font-bold text-primary-foreground hover:opacity-90"><Save className="h-3 w-3" /> Adicionar</button>
                            <button onClick={() => setAddingToPlanId(null)} className="rounded bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setAddingToPlanId(p.id)} className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-white/15 py-1.5 text-[11px] text-white/60 hover:bg-white/5">
                          <Plus className="h-3 w-3" /> Adicionar exercício
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Templates gallery */}
      <WorkoutTemplatesPanel
        mode="admin"
        readOnly
        title="Treinos prontos"
        subtitle="Escolha um treino da galeria FitMind, selecione a letra e ele será adicionado ao seu Meu Treino."
        enableSectionTitle="Adicionar como treino"
        enableSectionHint="Escolha a letra (A, B, C, D ou E). Cada letra cria um treino separado que você pode editar depois."
        onEnableForStudent={handleEnable}
      />
    </div>
  );
}
