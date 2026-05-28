// src/components/coach/tabs/ChallengeTab.tsx
// Adicione ao coach.tsx:
//   import { ChallengeTab } from "@/components/coach/tabs/ChallengeTab";
//   No type Tab, adicione: | "challenge"
//   No navItems, adicione: { id: "challenge", label: "Desafio", icon: Trophy }
//   No render, adicione: {activeTab === "challenge" && <ChallengeTab coachId={coachData?.id} />}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Scale, CheckCircle2, Clock, Calendar, Trophy, Loader2, ChevronDown, ChevronUp } from "lucide-react";

type Appointment = {
  id: string;
  type: "initial" | "final";
  requested_date: string;
  requested_time: string;
  status: string;
  weight_recorded: number | null;
  notes: string | null;
  student: { id: string; profile: { name: string } };
  enrollment: {
    id: string;
    gender: string;
    initial_weight: number | null;
    status: string;
    competition: { month: number; year: number };
    group: { group_number: number };
  };
};

type MyStudent = {
  enrollment_id: string;
  student_name: string;
  gender: string;
  status: string;
  initial_weight: number | null;
  final_weight: number | null;
  result_pct: number | null;
  final_date: string | null;
  comp_label: string;
  group_number: number;
};

const MONTHS = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const fmt = (d: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

const statusLabel: Record<string, string> = {
  enrolled: "Inscrito", scheduled_initial: "Ag. Inicial",
  weighed_initial: "Pesagem Inicial ✓", scheduled_final: "Ag. Final",
  weighed_final: "Pesagem Final ✓",
};

interface Props { coachId?: string }

export function ChallengeTab({ coachId }: Props) {
  const [pending, setPending] = useState<Appointment[]>([]);
  const [students, setStudents] = useState<MyStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"appointments" | "students">("appointments");
  const [weightModal, setWeightModal] = useState<{ apptId: string; enrollId: string; studentName: string; type: string } | null>(null);
  const [weightValue, setWeightValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  const load = async () => {
    if (!coachId) return;
    setLoading(true);
    try {
      // Agendamentos pendentes/confirmados
      const { data: appts } = await supabase
        .from("competition_appointments" as never)
        .select(`
          id, type, requested_date, requested_time, status, weight_recorded, notes,
          student:student_id ( id, profile:profile_id ( name ) ),
          enrollment:enrollment_id (
            id, gender, initial_weight, status,
            competition:competition_id ( month, year ),
            group:group_id ( group_number )
          )
        `)
        .eq("coach_id" as never, coachId)
        .in("status" as never, ["pending","confirmed"])
        .order("requested_date" as never)
        .order("requested_time" as never);
      setPending((appts as any[]) || []);

      // Todos os alunos do coach no desafio
      const { data: enrolls } = await supabase
        .from("competition_enrollments" as never)
        .select(`
          id, gender, status, initial_weight, final_weight, result_pct, final_date,
          competition:competition_id ( month, year ),
          group:group_id ( group_number ),
          student:student_id ( profile:profile_id ( name ) )
        `)
        .eq("coach_id" as never, coachId)
        .order("enrolled_at" as never, { ascending: false });
      setStudents(((enrolls as any[]) || []).map((e: any) => ({
        enrollment_id: e.id,
        student_name: e.student?.profile?.name || "—",
        gender: e.gender,
        status: e.status,
        initial_weight: e.initial_weight,
        final_weight: e.final_weight,
        result_pct: e.result_pct,
        final_date: e.final_date,
        comp_label: `${MONTHS[e.competition?.month || 1]} ${e.competition?.year || ""}`,
        group_number: e.group?.group_number || 0,
      })));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [coachId]);

  const confirmAppointment = async (apptId: string) => {
    await supabase
      .from("competition_appointments" as never)
      .update({ status: "confirmed" } as never)
      .eq("id" as never, apptId);
    // Notifica o aluno
    const appt = pending.find(a => a.id === apptId);
    if (appt) {
      const { data: studentProfile } = await supabase
        .from("students" as never)
        .select("profile_id")
        .eq("id" as never, (appt.student as any).id)
        .maybeSingle();
      if (studentProfile) {
        await supabase.from("notifications" as never).insert({
          profile_id: (studentProfile as any).profile_id,
          type: "competition_appointment_confirmed",
          title: `✅ Pesagem ${appt.type === "initial" ? "Inicial" : "Final"} Confirmada!`,
          message: `Seu agendamento para ${fmt(appt.requested_date)} às ${appt.requested_time.slice(0,5)} foi confirmado pelo coach.`,
          action_url: "/student/challenge",
        } as never);
      }
    }
    toast.success("Agendamento confirmado!");
    load();
  };

  const cancelAppointment = async (apptId: string) => {
    await supabase
      .from("competition_appointments" as never)
      .update({ status: "cancelled" } as never)
      .eq("id" as never, apptId);
    toast.success("Agendamento cancelado.");
    load();
  };

  const saveWeight = async () => {
    if (!weightModal || !weightValue) return;
    setSaving(true);
    try {
      const weight = Number(weightValue);
      // Completa o agendamento e registra o peso
      await supabase
        .from("competition_appointments" as never)
        .update({ status: "completed", weight_recorded: weight, updated_at: new Date().toISOString() } as never)
        .eq("id" as never, weightModal.apptId);

      // Atualiza a inscrição com o peso
      const isInitial = weightModal.type === "initial";
      const updates: Record<string, any> = isInitial
        ? { initial_weight: weight, status: "weighed_initial" }
        : { final_weight: weight, status: "weighed_final" };
      await supabase
        .from("competition_enrollments" as never)
        .update(updates as never)
        .eq("id" as never, weightModal.enrollId);

      toast.success(`Peso ${isInitial ? "inicial" : "final"} de ${weight} kg registrado!`);
      setWeightModal(null);
      setWeightValue("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao registrar peso");
    } finally { setSaving(false); }
  };

  const daysUntilFinal = (dateStr: string | null) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr + "T12:00:00").getTime() - Date.now()) / 86400000);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-foreground">Desafio FitMind</h2>
        {pending.length > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
            {pending.length}
          </span>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="grid grid-cols-2 gap-2">
        {(["appointments","students"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg py-2 text-sm font-bold ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {t === "appointments" ? `Agendamentos (${pending.length})` : `Meus Alunos (${students.length})`}
          </button>
        ))}
      </div>

      {/* ── Agendamentos ── */}
      {tab === "appointments" && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Nenhum agendamento pendente.</p>
            </div>
          ) : pending.map(appt => (
            <div key={appt.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-foreground">{(appt.student as any)?.profile?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Pesagem {appt.type === "initial" ? "Inicial" : "Final"} ·
                    {(appt.enrollment as any)?.comp_label || `${MONTHS[(appt.enrollment as any)?.competition?.month || 1]}`} · Turma {(appt.enrollment as any)?.group?.group_number}
                  </p>
                  {(appt.enrollment as any)?.initial_weight && appt.type === "final" && (
                    <p className="text-xs text-muted-foreground mt-1">Peso inicial: {(appt.enrollment as any).initial_weight} kg</p>
                  )}
                </div>
                <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                  appt.status === "confirmed" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"
                }`}>
                  {appt.status === "confirmed" ? "Confirmado" : "Pendente"}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground font-medium">
                  {fmt(appt.requested_date)} às {appt.requested_time.slice(0, 5)}
                </span>
              </div>

              <div className="flex gap-2">
                {appt.status === "pending" && (
                  <button onClick={() => confirmAppointment(appt.id)}
                    className="flex-1 rounded-lg bg-green-500/10 py-2 text-xs font-bold text-green-400 hover:bg-green-500/20">
                    ✓ Confirmar
                  </button>
                )}
                <button
                  onClick={() => setWeightModal({
                    apptId: appt.id,
                    enrollId: (appt.enrollment as any)?.id,
                    studentName: (appt.student as any)?.profile?.name,
                    type: appt.type,
                  })}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-primary/10 py-2 text-xs font-bold text-primary hover:bg-primary/20">
                  <Scale className="h-3 w-3" /> Registrar Peso
                </button>
                <button onClick={() => cancelAppointment(appt.id)}
                  className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive/20">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}


      {tab === "students" && (
        <div className="space-y-2">
          {students.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <Scale className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Nenhum aluno inscrito no desafio.</p>
            </div>
          ) : students.map(s => {
            const days = daysUntilFinal(s.final_date);
            const isUrgent = days !== null && days <= 7 && days > 0;
            return (
              <div key={s.enrollment_id}
                className={`rounded-2xl border bg-card overflow-hidden ${isUrgent ? "border-red-500/40" : "border-border"}`}>
                <button
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/10"
                  onClick={() => setExpandedStudent(expandedStudent === s.enrollment_id ? null : s.enrollment_id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      s.gender === "M" ? "bg-blue-500/20 text-blue-400" : "bg-pink-500/20 text-pink-400"
                    }`}>{s.gender}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{s.student_name}</p>
                      <p className="text-xs text-muted-foreground">{s.comp_label} · T{s.group_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isUrgent && <span className="text-xs font-bold text-red-400">{days}d</span>}
                    {s.result_pct != null && (
                      <span className={`text-sm font-bold ${s.result_pct > 0 ? "text-green-400" : "text-red-400"}`}>
                        {s.result_pct > 0 ? "−" : "+"}{Math.abs(s.result_pct)}%
                      </span>
                    )}

                    <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                      s.status === "weighed_final" ? "bg-green-500/10 text-green-400" :
                      s.status.includes("weighed") ? "bg-yellow-500/10 text-yellow-400" :
                      "bg-muted text-muted-foreground"
                    }`}>{statusLabel[s.status] || s.status}</span>
                    {expandedStudent === s.enrollment_id ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                  </div>
                </button>
                {expandedStudent === s.enrollment_id && (
                  <div className="px-4 pb-4 border-t border-border pt-3 grid grid-cols-3 gap-3 text-center text-xs">
                    <div>
                      <p className="text-muted-foreground">Peso Inicial</p>
                      <p className="font-bold text-foreground mt-0.5">{s.initial_weight ? `${s.initial_weight} kg` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Peso Final</p>
                      <p className="font-bold text-foreground mt-0.5">{s.final_weight ? `${s.final_weight} kg` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pesagem Final</p>
                      <p className={`font-bold mt-0.5 ${isUrgent ? "text-red-400" : "text-foreground"}`}>
                        {s.final_date ? fmt(s.final_date) : "—"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Registrar Peso */}
      {weightModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">

          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-bold text-foreground">
              Registrar Pesagem {weightModal.type === "initial" ? "Inicial" : "Final"}
            </h3>
            <p className="text-sm text-muted-foreground">{weightModal.studentName}</p>
            <div>
              <label className="text-xs text-muted-foreground">Peso (kg)</label>
              <input type="number" step="0.1" placeholder="Ex: 82.5" value={weightValue}
                onChange={e => setWeightValue(e.target.value)} autoFocus
                className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setWeightModal(null); setWeightValue(""); }}
                className="flex-1 rounded-lg bg-muted py-2 text-sm font-bold text-muted-foreground">
                Cancelar
              </button>
              <button onClick={saveWeight} disabled={saving || !weightValue}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
