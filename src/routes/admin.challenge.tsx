// src/routes/admin.challenge.tsx
// Adicione ao router: { path: '/admin/challenge', component: AdminChallengePage }
// No menu admin, adicione o link para /admin/challenge

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Plus, Scale, Award, ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react";


export const Route = createFileRoute("/admin/challenge")({
  component: AdminChallengePage,
});

type Competition = {
  id: string; month: number; year: number; status: string;
  prize_amount: number; description: string | null;
};
type CompGroup = {
  id: string; group_number: number;
  initial_start_date: string; initial_end_date: string;
  final_weigh_in_date: string; award_date: string | null;
  enrollments?: Enrollment[];
};
type Enrollment = {
  id: string; gender: string; status: string; enrolled_by: string;
  initial_date: string | null; initial_weight: number | null;
  final_date: string | null; final_weight: number | null;
  result_kg: number | null; result_pct: number | null;
  student: { id: string; profile: { name: string } };
  coach: { profile: { name: string } };
};
type Student = { id: string; coach_id: string; profile: { name: string }; coach: { profile: { name: string } } };

const MONTHS = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const fmt = (d: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminChallengePage() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [groups, setGroups] = useState<Record<string, CompGroup[]>>({});
  const [expandedComp, setExpandedComp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newPrize, setNewPrize] = useState(1000);
  // Manual enrollment
  const [enrollModal, setEnrollModal] = useState<{ groupId: string; compId: string } | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollStudentId, setEnrollStudentId] = useState("");
  const [enrollGender, setEnrollGender] = useState<"M" | "F">("M");
  const [enrolling, setEnrolling] = useState(false);
  // Weight recording
  const [weightModal, setWeightModal] = useState<{ enrollId: string; type: "initial" | "final"; studentName: string } | null>(null);
  const [weightValue, setWeightValue] = useState("");
  const [weightDate, setWeightDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingWeight, setSavingWeight] = useState(false);
  // Winner declaration
  const [winnerModal, setWinnerModal] = useState<Competition | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("competitions" as never)
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    setCompetitions((data as Competition[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const loadGroups = async (compId: string) => {
    const { data } = await supabase
      .from("competition_groups" as never)
      .select(`
        id, group_number, initial_start_date, initial_end_date,
        final_weigh_in_date, award_date,
        competition_enrollments (
          id, gender, status, enrolled_by,
          initial_date, initial_weight, final_date, final_weight,
          result_kg, result_pct,
          student:student_id ( id, profile:profile_id ( name ) ),
          coach:coach_id ( profile:profile_id ( name ) )
        )
      `)
      .eq("competition_id" as never, compId)
      .order("group_number" as never);
    const gs = (data as any[]) || [];
    setGroups(prev => ({
      ...prev,
      [compId]: gs.map(g => ({ ...g, enrollments: g.competition_enrollments }))
    }));
  };

  const createCompetition = async () => {
    setCreating(true);
    try {
      const { data: comp, error } = await supabase
        .from("competitions" as never)
        .insert({ month: newMonth, year: newYear, prize_amount: newPrize } as never)
        .select("id")
        .single();
      if (error) throw error;
      // Gera as 4 turmas automaticamente
      const { error: fnErr } = await supabase.rpc("generate_competition_groups" as never, {
        _competition_id: (comp as any).id,
        _year: newYear,
        _month: newMonth,
      } as never);
      if (fnErr) throw fnErr;
      toast.success(`Competição ${MONTHS[newMonth]}/${newYear} criada com 4 turmas!`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar competição");
    } finally { setCreating(false); }
  };

  const loadStudentsForEnroll = async () => {
    const { data } = await supabase
      .from("students" as never)
      .select("id, coach_id, profile:profile_id(name), coach:coach_id(profile:profile_id(name))")
      .limit(200);
    setStudents((data as any[]) || []);
  };

  const enrollManually = async () => {
    if (!enrollModal || !enrollStudentId) return;
    setEnrolling(true);
    try {
      // Find competition for this group
      const { data: groupData } = await supabase
        .from("competition_groups" as never)
        .select("competition_id")
        .eq("id" as never, enrollModal.groupId)
        .single();
      const { data: studentData } = await supabase
        .from("students" as never)
        .select("coach_id")
        .eq("id" as never, enrollStudentId)
        .single();
      await supabase.from("competition_enrollments" as never).insert({
        competition_id: (groupData as any).competition_id,
        group_id: enrollModal.groupId,
        student_id: enrollStudentId,
        coach_id: (studentData as any).coach_id,
        gender: enrollGender,
        enrolled_by: "admin",
      } as never);
      toast.success("Aluno inscrito com sucesso!");
      setEnrollModal(null);
      setEnrollStudentId("");
      loadGroups(enrollModal.compId);
    } catch (e: any) {
      toast.error(e.message || "Erro ao inscrever aluno");
    } finally { setEnrolling(false); }
  };

  const saveWeight = async () => {
    if (!weightModal || !weightValue) return;
    setSavingWeight(true);
    try {
      const isInitial = weightModal.type === "initial";
      const updates: Record<string, any> = isInitial
        ? { initial_date: weightDate, initial_weight: Number(weightValue), status: "weighed_initial" }
        : { final_weight: Number(weightValue), status: "weighed_final" };
      await supabase
        .from("competition_enrollments" as never)
        .update(updates as never)
        .eq("id" as never, weightModal.enrollId);
      toast.success(`Pesagem ${isInitial ? "inicial" : "final"} registrada!`);
      setWeightModal(null);
      setWeightValue("");
      // Reload groups
      if (expandedComp) loadGroups(expandedComp);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar pesagem");
    } finally { setSavingWeight(false); }
  };

  const declareWinner = async (enrollment: Enrollment, competition: Competition) => {
    if (enrollment.initial_weight == null || enrollment.final_weight == null) {
      toast.error("Aluno não tem ambas as pesagens registradas"); return;
    }
    try {
      // Busca o coach_id da inscrição (obrigatório)
      const { data: enrollFull, error: enrollErr } = await supabase
        .from("competition_enrollments" as never)
        .select("coach_id, result_kg, result_pct")
        .eq("id" as never, enrollment.id)
        .single();
      if (enrollErr || !enrollFull) throw enrollErr || new Error("Inscrição não encontrada");

      const { error } = await supabase.from("competition_hall_of_fame" as never).insert({
        competition_id: competition.id,
        enrollment_id: enrollment.id,
        student_id: enrollment.student.id,
        coach_id: (enrollFull as any).coach_id,
        gender: enrollment.gender,
        initial_weight: enrollment.initial_weight,
        final_weight: enrollment.final_weight,
        result_kg: (enrollFull as any).result_kg,
        result_pct: (enrollFull as any).result_pct,
        prize_amount: competition.prize_amount,
      } as never);
      if (error) throw error;
      toast.success("Vencedor declarado e adicionado ao Hall da Fama! 🏆");
    } catch (e: any) {
      toast.error(e.message || "Erro ao declarar vencedor");
    }
  };

  const deleteWeighing = async (enrollId: string, which: "initial" | "final" | "both") => {
    if (!confirm(which === "both" ? "Excluir ambas as pesagens?" : `Excluir pesagem ${which === "initial" ? "inicial" : "final"}?`)) return;
    try {
      const updates: Record<string, any> =
        which === "initial" ? { initial_date: null, initial_weight: null, final_weight: null, status: "enrolled" } :
        which === "final"   ? { final_weight: null, status: "weighed_initial" } :
                              { initial_date: null, initial_weight: null, final_weight: null, status: "enrolled" };
      const { error } = await supabase
        .from("competition_enrollments" as never)
        .update(updates as never)
        .eq("id" as never, enrollId);
      if (error) throw error;
      toast.success("Pesagem excluída.");
      if (expandedComp) loadGroups(expandedComp);
    } catch (e: any) { toast.error(e.message || "Erro ao excluir"); }
  };

  const markPrizePaid = async (winnerId: string) => {
    await supabase
      .from("competition_hall_of_fame" as never)
      .update({ prize_paid: true, prize_paid_at: new Date().toISOString() } as never)
      .eq("id" as never, winnerId);
    toast.success("Prêmio marcado como pago!");
  };

  const deleteCompetition = async (comp: Competition) => {
    if (!confirm(`Excluir a competição de ${MONTHS[comp.month]}/${comp.year}? Isso removerá turmas, inscrições, agendamentos e entradas do Hall da Fama desta competição.`)) return;
    try {
      const { error } = await supabase
        .from("competitions" as never)
        .delete()
        .eq("id" as never, comp.id);
      if (error) throw error;
      toast.success("Competição excluída.");
      setExpandedComp(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir competição");
    }
  };




  const statusLabel: Record<string, string> = {
    enrolled: "Inscrito", scheduled_initial: "Ag. Inicial", weighed_initial: "Pesagem Inicial ✓",
    scheduled_final: "Ag. Final", weighed_final: "Pesagem Final ✓",
  };
  const statusColor: Record<string, string> = {
    enrolled: "bg-muted text-muted-foreground", scheduled_initial: "bg-blue-500/10 text-blue-400",
    weighed_initial: "bg-yellow-500/10 text-yellow-400",
    scheduled_final: "bg-orange-500/10 text-orange-400",
    weighed_final: "bg-green-500/10 text-green-400",
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Desafio FitMind</h1>
      </div>

      {/* Criar nova competição */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold text-foreground mb-4">Nova Competição</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground">Mês</label>
            <select value={newMonth} onChange={e => setNewMonth(Number(e.target.value))}
              className="block mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
              {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Ano</label>
            <input type="number" value={newYear} onChange={e => setNewYear(Number(e.target.value))}
              className="block mt-1 w-24 rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Prêmio (por gênero)</label>
            <input type="number" value={newPrize} onChange={e => setNewPrize(Number(e.target.value))}
              className="block mt-1 w-32 rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
          </div>
          <button onClick={createCompetition} disabled={creating}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar + Gerar Turmas
          </button>
        </div>
      </div>

      {/* Lista de competições */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : competitions.map(comp => (
        <div key={comp.id} className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Header da competição */}
          <button
            className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/20 transition-colors"
            onClick={() => {
              if (expandedComp === comp.id) { setExpandedComp(null); }
              else { setExpandedComp(comp.id); loadGroups(comp.id); }
            }}
          >
            <div className="flex items-center gap-3">
              <Trophy className={`h-5 w-5 ${comp.status === "active" ? "text-primary" : "text-muted-foreground"}`} />
              <div>
                <p className="font-bold text-foreground">{MONTHS[comp.month]} {comp.year}</p>
                <p className="text-xs text-muted-foreground">
                  Prêmio: {money(comp.prize_amount)} por gênero · Status: <span className={comp.status === "active" ? "text-green-400" : "text-muted-foreground"}>{comp.status}</span>
                </p>
              </div>
            </div>
            {expandedComp === comp.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {expandedComp === comp.id && (
            <div className="border-t border-border p-5 space-y-4">
              {(groups[comp.id] || []).map(group => (
                <div key={group.id} className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                    <div>
                      <span className="text-sm font-bold text-foreground">Turma {group.group_number}</span>
                      <span className="ml-3 text-xs text-muted-foreground">
                        Pesagem inicial: {fmt(group.initial_start_date)} – {fmt(group.initial_end_date)}
                      </span>
                      <span className="ml-3 text-xs text-muted-foreground">
                        Pesagem final: {fmt(group.final_weigh_in_date)}
                      </span>
                      {group.award_date && (
                        <span className="ml-3 text-xs text-primary font-bold">
                          Premiação: {fmt(group.award_date)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => { setEnrollModal({ groupId: group.id, compId: comp.id }); loadStudentsForEnroll(); }}
                      className="flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20">
                      <Plus className="h-3 w-3" /> Inscrever Aluno
                    </button>
                  </div>

                  {/* Alunos da turma */}
                  {(group.enrollments || []).length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">Nenhum aluno inscrito nesta turma.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="px-4 py-2 text-left">Aluno</th>
                            <th className="px-4 py-2 text-left">Coach</th>
                            <th className="px-4 py-2 text-center">Gênero</th>
                            <th className="px-4 py-2 text-center">Status</th>
                            <th className="px-4 py-2 text-center">Peso Inicial</th>
                            <th className="px-4 py-2 text-center">Peso Final</th>
                            <th className="px-4 py-2 text-center">Resultado</th>
                            <th className="px-4 py-2 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(group.enrollments || [])
                            .sort((a, b) => (b.result_pct || 0) - (a.result_pct || 0))
                            .map(enroll => (
                            <tr key={enroll.id} className="border-b border-border/50 hover:bg-muted/10">
                              <td className="px-4 py-2 font-medium text-foreground">{(enroll.student as any)?.profile?.name || "—"}</td>
                              <td className="px-4 py-2 text-muted-foreground">{(enroll.coach as any)?.profile?.name || "—"}</td>
                              <td className="px-4 py-2 text-center">
                                <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${enroll.gender === "M" ? "bg-blue-500/20 text-blue-400" : "bg-pink-500/20 text-pink-400"}`}>
                                  {enroll.gender}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusColor[enroll.status]}`}>
                                  {statusLabel[enroll.status]}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">
                                {enroll.initial_weight != null ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <span>{enroll.initial_weight} kg</span>
                                    <button title="Editar" onClick={() => { setWeightValue(String(enroll.initial_weight)); setWeightDate(enroll.initial_date || new Date().toISOString().slice(0,10)); setWeightModal({ enrollId: enroll.id, type: "initial", studentName: (enroll.student as any)?.profile?.name }); }}
                                      className="text-xs text-blue-400 hover:underline">✎</button>
                                    <button title="Excluir" onClick={() => deleteWeighing(enroll.id, "initial")}
                                      className="text-xs text-red-400 hover:underline">✕</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setWeightValue(""); setWeightDate(new Date().toISOString().slice(0,10)); setWeightModal({ enrollId: enroll.id, type: "initial", studentName: (enroll.student as any)?.profile?.name }); }}
                                    className="text-primary underline">Registrar</button>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {enroll.final_weight != null ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <span>{enroll.final_weight} kg</span>
                                    <button title="Editar" onClick={() => { setWeightValue(String(enroll.final_weight)); setWeightModal({ enrollId: enroll.id, type: "final", studentName: (enroll.student as any)?.profile?.name }); }}
                                      className="text-xs text-blue-400 hover:underline">✎</button>
                                    <button title="Excluir" onClick={() => deleteWeighing(enroll.id, "final")}
                                      className="text-xs text-red-400 hover:underline">✕</button>
                                  </div>
                                ) : enroll.initial_weight != null ? (
                                  <button onClick={() => { setWeightValue(""); setWeightModal({ enrollId: enroll.id, type: "final", studentName: (enroll.student as any)?.profile?.name }); }}
                                    className="text-primary underline">Registrar</button>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {enroll.result_kg != null ? (
                                  <span className={`font-bold ${enroll.result_kg > 0 ? "text-green-400" : enroll.result_kg < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                                    {enroll.result_kg > 0 ? "−" : enroll.result_kg < 0 ? "+" : ""}{Math.abs(enroll.result_kg)} kg ({enroll.result_kg > 0 ? "−" : enroll.result_kg < 0 ? "+" : ""}{Math.abs(enroll.result_pct || 0)}%)
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {enroll.status === "weighed_final" && (
                                  <button onClick={() => declareWinner(enroll, comp)}
                                    className="flex items-center gap-1 rounded bg-yellow-500/10 px-2 py-1 text-xs font-bold text-yellow-400 hover:bg-yellow-500/20">
                                    <Award className="h-3 w-3" /> Vencedor
                                  </button>
                                )}
                              </td>

                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Modal: Inscrever Aluno */}
      {enrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-bold text-foreground">Inscrever Aluno Manualmente</h3>
            <div>
              <label className="text-xs text-muted-foreground">Aluno</label>
              <select value={enrollStudentId} onChange={e => setEnrollStudentId(e.target.value)}
                className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                <option value="">Selecione...</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {(s.profile as any)?.name} — Coach: {(s.coach as any)?.profile?.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Gênero</label>
              <div className="mt-1 flex gap-3">
                {(["M","F"] as const).map(g => (
                  <button key={g} onClick={() => setEnrollGender(g)}
                    className={`flex-1 rounded-lg py-2 text-sm font-bold ${enrollGender === g ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {g === "M" ? "Masculino" : "Feminino"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEnrollModal(null)} className="flex-1 rounded-lg bg-muted py-2 text-sm font-bold text-muted-foreground">Cancelar</button>
              <button onClick={enrollManually} disabled={enrolling || !enrollStudentId}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
                {enrolling ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Inscrever"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Peso */}
      {weightModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-bold text-foreground">
              Pesagem {weightModal.type === "initial" ? "Inicial" : "Final"} — {weightModal.studentName}
            </h3>
            <div>
              <label className="text-xs text-muted-foreground">Data</label>
              <input type="date" value={weightDate} onChange={e => setWeightDate(e.target.value)}
                className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Peso (kg)</label>
              <input type="number" step="0.1" placeholder="Ex: 82.5" value={weightValue}
                onChange={e => setWeightValue(e.target.value)}
                className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setWeightModal(null)} className="flex-1 rounded-lg bg-muted py-2 text-sm font-bold text-muted-foreground">Cancelar</button>
              <button onClick={saveWeight} disabled={savingWeight || !weightValue}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
                {savingWeight ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
