// src/routes/admin.challenge.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Plus, Scale, Award, ChevronDown, ChevronUp, Loader2, Trash2, Pencil, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getAdminTokenAttempts, type AdminTokenAttemptRow } from "@/lib/challenge-tokens.functions";

export const Route = createFileRoute("/admin/challenge")({
  component: AdminChallengePage,
});

type Competition = {
  id: string; month: number; year: number; status: string;
  prize_amount: number; description: string | null;
  finalized_at: string | null; finalized_by: string | null;
};
type CompGroup = {
  id: string;
  group_number: number | null;
  start_date: string | null;
  end_date: string | null;
  initial_start_date: string | null;
  initial_end_date: string | null;
  final_weigh_in_date: string | null;
  award_date: string | null;
  enrollments?: Enrollment[];
};
type Enrollment = {
  id: string; gender: string; status: string; enrolled_by: string;
  initial_date: string | null; initial_weight: number | null;
  final_date: string | null; final_weight: number | null;
  initial_body_fat: number | null; final_body_fat: number | null;
  initial_muscle_mass: number | null; final_muscle_mass: number | null;
  initial_share_url: string | null; final_share_url: string | null;
  result_kg: number | null; result_pct: number | null;
  result_fat_pct_lost: number | null;
  result_muscle_gain_pct: number | null;
  result_kg_lost: number | null;
  student: { id: string; profile: { name: string } };
  coach: { profile: { name: string } };
};
type Student = { id: string; coach_id: string; profile: { name: string }; coach: { profile: { name: string } } };

const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const fmt = (d: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type GroupForm = {
  id?: string;
  group_number: string;
  start_date: string;
  end_date: string;
  initial_start_date: string;
  initial_end_date: string;
  final_weigh_in_date: string;
  award_date: string;
};
const emptyGroupForm = (n = 1): GroupForm => ({
  group_number: String(n),
  start_date: "",
  end_date: "",
  initial_start_date: "",
  initial_end_date: "",
  final_weigh_in_date: "",
  award_date: "",
});

type WeighForm = {
  enrollId: string;
  type: "initial" | "final";
  studentName: string;
  date: string;
  weight: string;
  body_fat: string;
  muscle_mass: string;
  share_url: string;
};

function AdminChallengePage() {
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

  // Group CRUD
  const [groupModal, setGroupModal] = useState<{ compId: string; form: GroupForm } | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);

  // Weighing
  const [weighModal, setWeighModal] = useState<WeighForm | null>(null);
  const [savingWeigh, setSavingWeigh] = useState(false);

  // Finalize challenge
  const [finalizeModal, setFinalizeModal] = useState<{ comp: Competition; enrollments: Enrollment[] } | null>(null);
  const [finalizeMetric, setFinalizeMetric] = useState<"fat" | "kg" | "muscle">("fat");
  const [winnerMaleId, setWinnerMaleId] = useState<string>("");
  const [winnerFemaleId, setWinnerFemaleId] = useState<string>("");
  const [finalizing, setFinalizing] = useState(false);

  // Tentativas de moeda
  const [attempts, setAttempts] = useState<AdminTokenAttemptRow[]>([]);
  const [attemptsOnlyFailures, setAttemptsOnlyFailures] = useState(true);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [showAttempts, setShowAttempts] = useState(false);
  const fetchAttempts = useServerFn(getAdminTokenAttempts);

  const loadAttempts = async (onlyFailures: boolean) => {
    setAttemptsLoading(true);
    try {
      const rows = await fetchAttempts({ data: { onlyFailures, limit: 100 } });
      setAttempts(rows);
    } catch (e) {
      console.warn("attempts fetch failed", e);
      toast.error("Erro ao carregar tentativas");
    } finally {
      setAttemptsLoading(false);
    }
  };

  useEffect(() => {
    if (showAttempts) loadAttempts(attemptsOnlyFailures);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAttempts, attemptsOnlyFailures]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("competitions" as never)
      .select("*")
      .order("year" as never, { ascending: false })
      .order("month" as never, { ascending: false });
    setCompetitions((data as Competition[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadGroups = async (compId: string) => {
    const { data } = await supabase
      .from("competition_groups" as never)
      .select(`
        id, group_number, start_date, end_date,
        initial_start_date, initial_end_date,
        final_weigh_in_date, award_date,
        competition_enrollments (
          id, gender, status, enrolled_by,
          initial_date, initial_weight, final_date, final_weight,
          initial_body_fat, final_body_fat,
          initial_muscle_mass, final_muscle_mass,
          initial_share_url, final_share_url,
          result_kg, result_pct,
          result_fat_pct_lost, result_muscle_gain_pct, result_kg_lost,
          student:student_id ( id, profile:profile_id ( name ) ),
          coach:coach_id ( profile:profile_id ( name ) )
        )
      `)
      .eq("competition_id" as never, compId as never)
      .order("group_number" as never, { ascending: true, nullsFirst: false });
    const gs = (data as any[]) || [];
    setGroups(prev => ({
      ...prev,
      [compId]: gs.map(g => ({ ...g, enrollments: g.competition_enrollments }))
    }));
  };

  const createCompetition = async () => {
    setCreating(true);
    try {
      const { error } = await supabase
        .from("competitions" as never)
        .insert({ month: newMonth, year: newYear, prize_amount: newPrize } as never);
      if (error) throw error;
      toast.success(`Edição ${MONTHS[newMonth]}/${newYear} criada. Adicione as turmas manualmente.`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar edição");
    } finally { setCreating(false); }
  };

  const openNewGroup = (compId: string) => {
    const existing = groups[compId] || [];
    const next = (existing.reduce((m, g) => Math.max(m, g.group_number || 0), 0) || 0) + 1;
    setGroupModal({ compId, form: emptyGroupForm(next) });
  };
  const openEditGroup = (compId: string, g: CompGroup) => {
    setGroupModal({
      compId,
      form: {
        id: g.id,
        group_number: String(g.group_number ?? ""),
        start_date: g.start_date || "",
        end_date: g.end_date || "",
        initial_start_date: g.initial_start_date || "",
        initial_end_date: g.initial_end_date || "",
        final_weigh_in_date: g.final_weigh_in_date || "",
        award_date: g.award_date || "",
      }
    });
  };

  const saveGroup = async () => {
    if (!groupModal) return;
    const { compId, form } = groupModal;
    setSavingGroup(true);
    try {
      const payload: any = {
        competition_id: compId,
        group_number: form.group_number ? Number(form.group_number) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        initial_start_date: form.initial_start_date || null,
        initial_end_date: form.initial_end_date || null,
        final_weigh_in_date: form.final_weigh_in_date || null,
        award_date: form.award_date || null,
      };
      if (form.id) {
        const { error } = await supabase.from("competition_groups" as never)
          .update(payload as never).eq("id" as never, form.id as never);
        if (error) throw error;
        toast.success("Turma atualizada.");
      } else {
        const { error } = await supabase.from("competition_groups" as never)
          .insert(payload as never);
        if (error) throw error;
        toast.success("Turma criada.");
      }
      setGroupModal(null);
      loadGroups(compId);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar turma");
    } finally { setSavingGroup(false); }
  };

  const deleteGroup = async (compId: string, g: CompGroup) => {
    if (!confirm(`Excluir turma ${g.group_number ?? ""}? Inscrições e agendamentos vinculados também serão removidos.`)) return;
    try {
      const { error } = await supabase.from("competition_groups" as never)
        .delete().eq("id" as never, g.id as never);
      if (error) throw error;
      toast.success("Turma excluída.");
      loadGroups(compId);
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir turma");
    }
  };

  const loadStudentsForEnroll = async () => {
    const { data } = await supabase
      .from("students" as never)
      .select("id, coach_id, profile:profile_id(name), coach:coach_id(profile:profile_id(name))")
      .limit(500);
    setStudents((data as any[]) || []);
  };

  const enrollManually = async () => {
    if (!enrollModal || !enrollStudentId) return;
    setEnrolling(true);
    try {
      const { data: studentData } = await supabase
        .from("students" as never).select("coach_id").eq("id" as never, enrollStudentId as never).single();
      await supabase.from("competition_enrollments" as never).insert({
        competition_id: enrollModal.compId,
        group_id: enrollModal.groupId,
        student_id: enrollStudentId,
        coach_id: (studentData as any).coach_id,
        gender: enrollGender,
        enrolled_by: "admin",
      } as never);
      toast.success("Aluno inscrito!");
      setEnrollModal(null); setEnrollStudentId("");
      loadGroups(enrollModal.compId);
    } catch (e: any) {
      toast.error(e.message || "Erro ao inscrever");
    } finally { setEnrolling(false); }
  };

  const openWeigh = (enroll: Enrollment, type: "initial" | "final") => {
    setWeighModal({
      enrollId: enroll.id,
      type,
      studentName: (enroll.student as any)?.profile?.name || "Aluno",
      date: (type === "initial" ? enroll.initial_date : enroll.final_date) || new Date().toISOString().slice(0, 10),
      weight: String((type === "initial" ? enroll.initial_weight : enroll.final_weight) ?? ""),
      body_fat: String((type === "initial" ? enroll.initial_body_fat : enroll.final_body_fat) ?? ""),
      muscle_mass: String((type === "initial" ? enroll.initial_muscle_mass : enroll.final_muscle_mass) ?? ""),
      share_url: (type === "initial" ? enroll.initial_share_url : enroll.final_share_url) || "",
    });
  };

  const saveWeigh = async () => {
    if (!weighModal) return;
    setSavingWeigh(true);
    try {
      const isInitial = weighModal.type === "initial";
      const updates: Record<string, any> = isInitial ? {
        initial_date: weighModal.date,
        initial_weight: weighModal.weight ? Number(weighModal.weight) : null,
        initial_body_fat: weighModal.body_fat ? Number(weighModal.body_fat) : null,
        initial_muscle_mass: weighModal.muscle_mass ? Number(weighModal.muscle_mass) : null,
        initial_share_url: weighModal.share_url || null,
        status: "weighed_initial",
      } : {
        final_date: weighModal.date,
        final_weight: weighModal.weight ? Number(weighModal.weight) : null,
        final_body_fat: weighModal.body_fat ? Number(weighModal.body_fat) : null,
        final_muscle_mass: weighModal.muscle_mass ? Number(weighModal.muscle_mass) : null,
        final_share_url: weighModal.share_url || null,
        status: "weighed_final",
      };
      const { error } = await supabase.from("competition_enrollments" as never)
        .update(updates as never).eq("id" as never, weighModal.enrollId as never);
      if (error) throw error;
      toast.success(`Pesagem ${isInitial ? "inicial" : "final"} salva.`);
      setWeighModal(null);
      if (expandedComp) loadGroups(expandedComp);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally { setSavingWeigh(false); }
  };

  const deleteWeighing = async (enrollId: string, which: "initial" | "final") => {
    if (!confirm(`Excluir pesagem ${which === "initial" ? "inicial" : "final"}?`)) return;
    try {
      const updates: Record<string, any> = which === "initial" ? {
        initial_date: null, initial_weight: null, initial_body_fat: null,
        initial_muscle_mass: null, initial_share_url: null,
        final_weight: null, final_body_fat: null, final_muscle_mass: null, final_share_url: null,
        status: "enrolled",
      } : {
        final_date: null, final_weight: null, final_body_fat: null,
        final_muscle_mass: null, final_share_url: null,
        status: "weighed_initial",
      };
      const { error } = await supabase.from("competition_enrollments" as never)
        .update(updates as never).eq("id" as never, enrollId as never);
      if (error) throw error;
      toast.success("Pesagem excluída.");
      if (expandedComp) loadGroups(expandedComp);
    } catch (e: any) { toast.error(e.message || "Erro ao excluir"); }
  };

  const declareWinner = async (enroll: Enrollment, competition: Competition) => {
    if (enroll.initial_body_fat == null || enroll.final_body_fat == null) {
      toast.error("Aluno não tem ambas as bioimpedâncias registradas"); return;
    }
    try {
      const { data: enrollFull } = await supabase.from("competition_enrollments" as never)
        .select("coach_id").eq("id" as never, enroll.id as never).single();
      const { error } = await supabase.from("competition_hall_of_fame" as never).insert({
        competition_id: competition.id,
        enrollment_id: enroll.id,
        student_id: enroll.student.id,
        coach_id: (enrollFull as any).coach_id,
        gender: enroll.gender,
        initial_weight: enroll.initial_weight,
        final_weight: enroll.final_weight,
        result_kg: enroll.result_kg,
        result_pct: enroll.result_pct,
        prize_amount: competition.prize_amount,
      } as never);
      if (error) throw error;
      toast.success("Vencedor adicionado ao Hall da Fama! 🏆");
    } catch (e: any) {
      toast.error(e.message || "Erro ao declarar vencedor");
    }
  };

  const openFinalize = async (comp: Competition) => {
    // Make sure groups for this competition are loaded
    if (!groups[comp.id]) await loadGroups(comp.id);
    const allEnrolls: Enrollment[] = (groups[comp.id] || []).flatMap(g => g.enrollments || []);
    // If not loaded yet, fetch directly
    let enrollments = allEnrolls;
    if (enrollments.length === 0) {
      const { data } = await supabase
        .from("competition_groups" as never)
        .select(`
          id,
          competition_enrollments (
            id, gender, status, enrolled_by,
            initial_date, initial_weight, final_date, final_weight,
            initial_body_fat, final_body_fat,
            initial_muscle_mass, final_muscle_mass,
            initial_share_url, final_share_url,
            result_kg, result_pct,
            result_fat_pct_lost, result_muscle_gain_pct, result_kg_lost,
            student:student_id ( id, profile:profile_id ( name ) ),
            coach:coach_id ( profile:profile_id ( name ) )
          )
        `)
        .eq("competition_id" as never, comp.id as never);
      enrollments = ((data as any[]) || []).flatMap(g => g.competition_enrollments || []);
    }
    setFinalizeMetric("fat");
    setWinnerMaleId("");
    setWinnerFemaleId("");
    setFinalizeModal({ comp, enrollments });
  };

  const finalizeChallenge = async () => {
    if (!finalizeModal) return;
    const { comp, enrollments } = finalizeModal;
    if (comp.finalized_at) {
      if (!confirm("Este desafio já foi finalizado. Refinalizar irá registrar uma NOVA entrada de histórico (a anterior será mantida). Continuar?")) return;
    }
    setFinalizing(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id || null;

      // Build ranking snapshot per metric/gender
      const sortBy = (list: Enrollment[], key: "result_fat_pct_lost" | "result_kg_lost" | "result_muscle_gain_pct") =>
        list.filter(e => (e[key] ?? 0) > 0).sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0));
      const males = enrollments.filter(e => e.gender === "M");
      const females = enrollments.filter(e => e.gender === "F");
      const snapshot = {
        metric: finalizeMetric,
        rankings: {
          M: {
            fat: sortBy(males, "result_fat_pct_lost").map((e, i) => ({ rank: i + 1, enrollment_id: e.id, student_id: e.student.id, name: (e.student as any).profile?.name, value: e.result_fat_pct_lost })),
            kg: sortBy(males, "result_kg_lost").map((e, i) => ({ rank: i + 1, enrollment_id: e.id, student_id: e.student.id, name: (e.student as any).profile?.name, value: e.result_kg_lost })),
            muscle: sortBy(males, "result_muscle_gain_pct").map((e, i) => ({ rank: i + 1, enrollment_id: e.id, student_id: e.student.id, name: (e.student as any).profile?.name, value: e.result_muscle_gain_pct })),
          },
          F: {
            fat: sortBy(females, "result_fat_pct_lost").map((e, i) => ({ rank: i + 1, enrollment_id: e.id, student_id: e.student.id, name: (e.student as any).profile?.name, value: e.result_fat_pct_lost })),
            kg: sortBy(females, "result_kg_lost").map((e, i) => ({ rank: i + 1, enrollment_id: e.id, student_id: e.student.id, name: (e.student as any).profile?.name, value: e.result_kg_lost })),
            muscle: sortBy(females, "result_muscle_gain_pct").map((e, i) => ({ rank: i + 1, enrollment_id: e.id, student_id: e.student.id, name: (e.student as any).profile?.name, value: e.result_muscle_gain_pct })),
          },
        },
      };

      // Insert winners into hall of fame (M and F) if selected
      const winnersToInsert: any[] = [];
      const pushWinner = async (winnerId: string, gender: "M" | "F") => {
        const enroll = enrollments.find(e => e.id === winnerId);
        if (!enroll) return;
        const { data: enrollFull } = await supabase.from("competition_enrollments" as never)
          .select("coach_id").eq("id" as never, enroll.id as never).single();
        winnersToInsert.push({
          competition_id: comp.id,
          enrollment_id: enroll.id,
          student_id: enroll.student.id,
          coach_id: (enrollFull as any).coach_id,
          gender,
          initial_weight: enroll.initial_weight,
          final_weight: enroll.final_weight,
          result_kg: enroll.result_kg ?? 0,
          result_pct: enroll.result_pct ?? 0,
          prize_amount: comp.prize_amount,
        });
      };
      if (winnerMaleId) await pushWinner(winnerMaleId, "M");
      if (winnerFemaleId) await pushWinner(winnerFemaleId, "F");

      if (winnersToInsert.length > 0) {
        const { error: hofErr } = await supabase
          .from("competition_hall_of_fame" as never)
          .insert(winnersToInsert as never);
        if (hofErr) throw hofErr;
      }

      // Mark competition as finalized
      const { error: compErr } = await supabase.from("competitions" as never)
        .update({ finalized_at: new Date().toISOString(), finalized_by: userId, status: "closed" } as never)
        .eq("id" as never, comp.id as never);
      if (compErr) throw compErr;

      // Audit log entry (immutable history)
      await supabase.from("competition_finalization_log" as never).insert({
        competition_id: comp.id,
        finalized_by: userId,
        winner_male_enrollment_id: winnerMaleId || null,
        winner_female_enrollment_id: winnerFemaleId || null,
        snapshot,
      } as never);

      toast.success("Desafio finalizado! Resultados publicados no Hall da Fama. 🏆");
      setFinalizeModal(null);
      load();
      if (expandedComp) loadGroups(expandedComp);
    } catch (e: any) {
      toast.error(e.message || "Erro ao finalizar desafio");
    } finally {
      setFinalizing(false);
    }
  };

  const deleteCompetition = async (comp: Competition) => {
    if (!confirm(`Excluir ${MONTHS[comp.month]}/${comp.year}? Tudo desta edição será removido.`)) return;
    try {
      const { error } = await supabase.from("competitions" as never).delete().eq("id" as never, comp.id as never);
      if (error) throw error;
      toast.success("Edição excluída."); setExpandedComp(null); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const removeEnrollment = async (enrollId: string, studentName: string) => {
    if (!confirm(`Remover ${studentName}?`)) return;
    try {
      const { error } = await supabase.from("competition_enrollments" as never).delete().eq("id" as never, enrollId as never);
      if (error) throw error;
      toast.success("Aluno removido.");
      if (expandedComp) loadGroups(expandedComp);
    } catch (e: any) { toast.error(e.message); }
  };

  const fmtResult = (e: Enrollment) => {
    if (e.result_fat_pct_lost == null) return "—";
    const v = e.result_fat_pct_lost;
    return (
      <span className={`font-bold ${v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "text-muted-foreground"}`}>
        {v > 0 ? "−" : "+"}{Math.abs(v).toFixed(2)}% gord.
      </span>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Desafio FitMind</h1>
      </div>

      {/* Nova edição */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold text-foreground mb-4">Nova Edição</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground">Mês de referência</label>
            <select value={newMonth} onChange={e => setNewMonth(Number(e.target.value))}
              className="block mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
              {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
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
            Criar Edição
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">As turmas devem ser adicionadas manualmente com as datas exatas (podem cruzar meses).</p>
      </div>

      {/* Tentativas de uso de moeda de desafio */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <button onClick={() => setShowAttempts((v) => !v)} className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Tentativas de entrada por moeda</h2>
            <span className="text-xs text-muted-foreground">{showAttempts ? "(clique para ocultar)" : "(clique para abrir)"}</span>
          </div>
          {showAttempts ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {showAttempts && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setAttemptsOnlyFailures(true)}
                className={`rounded-full px-3 py-1 font-bold ${attemptsOnlyFailures ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}
              >Apenas falhas</button>
              <button
                onClick={() => setAttemptsOnlyFailures(false)}
                className={`rounded-full px-3 py-1 font-bold ${!attemptsOnlyFailures ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
              >Todas</button>
              <button
                onClick={() => loadAttempts(attemptsOnlyFailures)}
                className="ml-auto rounded-lg bg-muted px-3 py-1 text-xs text-foreground"
              >Atualizar</button>
            </div>
            {attemptsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : attempts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma tentativa registrada.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Aluno</th>
                      <th className="px-3 py-2">Erro</th>
                      <th className="px-3 py-2">Mensagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a) => (
                      <tr key={a.id} className="border-t border-border">
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{new Date(a.createdAt).toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2">
                          {a.success ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 font-bold text-success"><CheckCircle2 className="h-3 w-3" /> Sucesso</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 font-bold text-destructive"><AlertTriangle className="h-3 w-3" /> Falha</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-foreground">{a.studentName || "—"}</td>
                        <td className="px-3 py-2 text-foreground"><code>{a.errorCode || "—"}</code></td>
                        <td className="px-3 py-2 text-muted-foreground">{a.errorMessage || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>



      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : competitions.map(comp => (
        <div key={comp.id} className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="w-full flex items-center justify-between p-5 hover:bg-muted/20">
            <button className="flex items-center gap-3 text-left flex-1"
              onClick={() => {
                if (expandedComp === comp.id) setExpandedComp(null);
                else { setExpandedComp(comp.id); loadGroups(comp.id); }
              }}>
              <Trophy className={`h-5 w-5 ${comp.status === "active" ? "text-primary" : "text-muted-foreground"}`} />
              <div>
                <p className="font-bold text-foreground">{MONTHS[comp.month]} {comp.year}</p>
                <p className="text-xs text-muted-foreground">
                  Prêmio: {money(comp.prize_amount)} por gênero · {comp.status}
                </p>
              </div>
            </button>
            <div className="flex items-center gap-2">
              <button onClick={(e) => { e.stopPropagation(); deleteCompetition(comp); }}
                className="flex items-center gap-1 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/20">
                <Trash2 className="h-3 w-3" /> Excluir
              </button>
              {expandedComp === comp.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>

          {expandedComp === comp.id && (
            <div className="border-t border-border p-5 space-y-4">
              <div className="flex justify-end">
                <button onClick={() => openNewGroup(comp.id)}
                  className="flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20">
                  <Plus className="h-3 w-3" /> Adicionar Turma
                </button>
              </div>

              {(groups[comp.id] || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma turma. Clique em "Adicionar Turma".</p>
              ) : (groups[comp.id] || []).map(group => (
                <div key={group.id} className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-foreground">Turma {group.group_number ?? "?"}</span>
                      <div className="text-xs text-muted-foreground space-x-3 mt-0.5">
                        <span>Período: {fmt(group.start_date)} → {fmt(group.end_date)}</span>
                        <span>Pes. inicial: {fmt(group.initial_start_date)} → {fmt(group.initial_end_date)}</span>
                        <span>Pes. final: {fmt(group.final_weigh_in_date)}</span>
                        {group.award_date && <span className="text-primary font-bold">Premiação: {fmt(group.award_date)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEditGroup(comp.id, group)}
                        className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted/70">
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
                      <button onClick={() => deleteGroup(comp.id, group)}
                        className="flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20">
                        <Trash2 className="h-3 w-3" /> Excluir
                      </button>
                      <button onClick={() => { setEnrollModal({ groupId: group.id, compId: comp.id }); loadStudentsForEnroll(); }}
                        className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs font-bold text-primary hover:bg-primary/20">
                        <Plus className="h-3 w-3" /> Inscrever
                      </button>
                    </div>
                  </div>

                  {(group.enrollments || []).length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">Nenhum aluno.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="px-3 py-2 text-left">Aluno</th>
                            <th className="px-3 py-2 text-left">Coach</th>
                            <th className="px-3 py-2 text-center">Gen</th>
                            <th className="px-3 py-2 text-center">Inicial</th>
                            <th className="px-3 py-2 text-center">Final</th>
                            <th className="px-3 py-2 text-center">Resultado</th>
                            <th className="px-3 py-2 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(group.enrollments || [])
                            .sort((a, b) => (b.result_fat_pct_lost || 0) - (a.result_fat_pct_lost || 0))
                            .map(enroll => (
                              <tr key={enroll.id} className="border-b border-border/50 hover:bg-muted/10">
                                <td className="px-3 py-2 font-medium text-foreground">{(enroll.student as any)?.profile?.name || "—"}</td>
                                <td className="px-3 py-2 text-muted-foreground">{(enroll.coach as any)?.profile?.name || "—"}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${enroll.gender === "M" ? "bg-blue-500/20 text-blue-400" : "bg-pink-500/20 text-pink-400"}`}>{enroll.gender}</span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {enroll.initial_weight != null || enroll.initial_body_fat != null || enroll.initial_muscle_mass != null ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <div className="text-[10px] leading-tight">
                                        {enroll.initial_weight != null && <div>{enroll.initial_weight}kg</div>}
                                        {enroll.initial_body_fat != null && <div className="text-orange-400">{enroll.initial_body_fat}%g</div>}
                                        {enroll.initial_muscle_mass != null && <div className="text-blue-400">{enroll.initial_muscle_mass}%m</div>}
                                      </div>
                                      {enroll.initial_share_url && (
                                        <a href={enroll.initial_share_url} target="_blank" rel="noopener noreferrer" title="Auditoria" className="text-blue-400"><ExternalLink className="h-3 w-3" /></a>
                                      )}
                                      <button onClick={() => openWeigh(enroll, "initial")} className="text-blue-400">✎</button>
                                      <button onClick={() => deleteWeighing(enroll.id, "initial")} className="text-red-400">✕</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => openWeigh(enroll, "initial")} className="text-primary underline">Registrar</button>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {enroll.final_weight != null || enroll.final_body_fat != null || enroll.final_muscle_mass != null ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <div className="text-[10px] leading-tight">
                                        {enroll.final_weight != null && <div>{enroll.final_weight}kg</div>}
                                        {enroll.final_body_fat != null && <div className="text-orange-400">{enroll.final_body_fat}%g</div>}
                                        {enroll.final_muscle_mass != null && <div className="text-blue-400">{enroll.final_muscle_mass}%m</div>}
                                      </div>
                                      {enroll.final_share_url && (
                                        <a href={enroll.final_share_url} target="_blank" rel="noopener noreferrer" title="Auditoria" className="text-green-400"><ExternalLink className="h-3 w-3" /></a>
                                      )}
                                      <button onClick={() => openWeigh(enroll, "final")} className="text-blue-400">✎</button>
                                      <button onClick={() => deleteWeighing(enroll.id, "final")} className="text-red-400">✕</button>
                                    </div>
                                  ) : enroll.initial_weight != null || enroll.initial_body_fat != null ? (
                                    <button onClick={() => openWeigh(enroll, "final")} className="text-primary underline">Registrar</button>
                                  ) : "—"}
                                </td>
                                <td className="px-3 py-2 text-center">{fmtResult(enroll)}</td>
                                <td className="px-3 py-2 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    {(enroll.initial_body_fat != null && enroll.final_body_fat != null) && (
                                      <button onClick={() => declareWinner(enroll, comp)}
                                        className="flex items-center gap-1 rounded bg-yellow-500/10 px-2 py-1 text-xs font-bold text-yellow-400 hover:bg-yellow-500/20">
                                        <Award className="h-3 w-3" /> Vencedor
                                      </button>
                                    )}
                                    <button onClick={() => removeEnrollment(enroll.id, (enroll.student as any)?.profile?.name || "Aluno")}
                                      className="flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 text-xs font-bold text-destructive hover:bg-destructive/20">
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
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

      {/* Modal: Adicionar/Editar Turma */}
      {groupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="w-full max-w-md my-8 rounded-2xl border border-border bg-card p-6 space-y-3">
            <h3 className="font-bold text-foreground">{groupModal.form.id ? "Editar Turma" : "Nova Turma"}</h3>
            <div>
              <label className="text-xs text-muted-foreground">Número da Turma</label>
              <input type="number" value={groupModal.form.group_number}
                onChange={e => setGroupModal({ ...groupModal, form: { ...groupModal.form, group_number: e.target.value } })}
                className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Início da turma</label>
                <input type="date" value={groupModal.form.start_date}
                  onChange={e => setGroupModal({ ...groupModal, form: { ...groupModal.form, start_date: e.target.value } })}
                  className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fim da turma</label>
                <input type="date" value={groupModal.form.end_date}
                  onChange={e => setGroupModal({ ...groupModal, form: { ...groupModal.form, end_date: e.target.value } })}
                  className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Pesagem inicial — de</label>
                <input type="date" value={groupModal.form.initial_start_date}
                  onChange={e => setGroupModal({ ...groupModal, form: { ...groupModal.form, initial_start_date: e.target.value } })}
                  className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">até</label>
                <input type="date" value={groupModal.form.initial_end_date}
                  onChange={e => setGroupModal({ ...groupModal, form: { ...groupModal.form, initial_end_date: e.target.value } })}
                  className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Pesagem final</label>
                <input type="date" value={groupModal.form.final_weigh_in_date}
                  onChange={e => setGroupModal({ ...groupModal, form: { ...groupModal.form, final_weigh_in_date: e.target.value } })}
                  className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Premiação (opcional)</label>
                <input type="date" value={groupModal.form.award_date}
                  onChange={e => setGroupModal({ ...groupModal, form: { ...groupModal.form, award_date: e.target.value } })}
                  className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setGroupModal(null)} className="flex-1 rounded-lg bg-muted py-2 text-sm font-bold text-muted-foreground">Cancelar</button>
              <button onClick={saveGroup} disabled={savingGroup}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
                {savingGroup ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Inscrever Aluno */}
      {enrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-bold text-foreground">Inscrever Aluno</h3>
            <div>
              <label className="text-xs text-muted-foreground">Aluno</label>
              <select value={enrollStudentId} onChange={e => setEnrollStudentId(e.target.value)}
                className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                <option value="">Selecione...</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {(s.profile as any)?.name} — {(s.coach as any)?.profile?.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Gênero</label>
              <div className="mt-1 flex gap-3">
                {(["M", "F"] as const).map(g => (
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

      {/* Modal: Pesagem (bioimpedância) */}
      {weighModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="w-full max-w-md my-8 rounded-2xl border border-border bg-card p-6 space-y-3">
            <h3 className="font-bold text-foreground">
              Pesagem {weighModal.type === "initial" ? "Inicial" : "Final"} — {weighModal.studentName}
            </h3>
            <p className="text-xs text-muted-foreground">Use os valores da bioimpedância do FitMindShape. Cole o link compartilhável para auditoria.</p>
            <div>
              <label className="text-xs text-muted-foreground">Data</label>
              <input type="date" value={weighModal.date} onChange={e => setWeighModal({ ...weighModal, date: e.target.value })}
                className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Peso (kg)</label>
                <input type="number" step="0.1" value={weighModal.weight} onChange={e => setWeighModal({ ...weighModal, weight: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">% Gordura *</label>
                <input type="number" step="0.1" value={weighModal.body_fat} onChange={e => setWeighModal({ ...weighModal, body_fat: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">M. Mus. (kg)</label>
                <input type="number" step="0.1" value={weighModal.muscle_mass} onChange={e => setWeighModal({ ...weighModal, muscle_mass: e.target.value })}
                  className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Link de compartilhamento FitMindShape (auditoria)</label>
              <input type="url" placeholder="https://.../resultado/..." value={weighModal.share_url}
                onChange={e => setWeighModal({ ...weighModal, share_url: e.target.value })}
                className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setWeighModal(null)} className="flex-1 rounded-lg bg-muted py-2 text-sm font-bold text-muted-foreground">Cancelar</button>
              <button onClick={saveWeigh} disabled={savingWeigh}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
                {savingWeigh ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
