import { useEffect, useState } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import FitMindShape, { type FitMindAssessment, type FitMindClient } from "@/components/coach/FitMindShape";
import { createCoachCalendarEvent } from "@/server/google-calendar.functions";
import FineshapeImport from "@/components/coach/FineshapeImport";
import { Trophy } from "lucide-react";

type ChallengeLink = {
  enrollmentId: string;
  type: "initial" | "final";
  studentId: string;
  studentName: string;
  compLabel: string;
  preferredClientId?: string;
};

export function EvaluateTab() {
  const [clients, setClients] = useState<FitMindClient[]>([]);
  const [coachInfo, setCoachInfo] = useState({ id: "", name: "Coach FitMind", email: "", specialty: "Avaliação corporal" });

  // Listen for popup connect completion
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e?.data?.type === "google-oauth-connected") {
        toast.success("Google Agenda conectado! Clique novamente em 'Criar Evento'.");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const openGoogleConnectPopup = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { toast.error("Faça login novamente."); return; }
    const w = 520, h = 640;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(
      `/api/oauth/google/start?popup=1&access_token=${encodeURIComponent(token)}`,
      "google-oauth",
      `width=${w},height=${h},left=${left},top=${top}`
    );
  };

  const mapAssessment = (row: any): FitMindAssessment => ({
    id: row.id,
    clientId: row.client_id,
    date: row.assessment_date,
    method: row.method,
    age: row.age || 0,
    height: Number(row.height || 0),
    weight: Number(row.weight || 0),
    bmi: Number(row.bmi || 0),
    bodyFat: Number(row.body_fat || 0),
    skeletalMuscle: Number(row.skeletal_muscle || 0),
    muscleMass: Number(row.muscle_mass || 0),
    visceralFat: Number(row.visceral_fat || 0),
    basalMetabolism: Number(row.basal_metabolism || 0),
    bodyAge: row.body_age || 0,
    bodyWater: Number(row.body_water || 0),
    boneMass: Number(row.bone_mass || 0),
    segmentAnalysis: row.segment_analysis || undefined,
    systolicBP: row.systolic_bp || undefined,
    diastolicBP: row.diastolic_bp || undefined,
    heartRate: row.heart_rate || undefined,
    bloodGlucose: row.blood_glucose ? Number(row.blood_glucose) : undefined,
    clientNotes: row.client_notes || undefined,
    professionalNotes: row.professional_notes || undefined,
    photos: row.photos || undefined,
    nextAssessmentDate: row.next_assessment_date || undefined,
    nextAssessmentTime: row.next_assessment_time || undefined,
    groupId: row.group_id || undefined,
  });

  const loadClients = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: profile } = await supabase.from("profiles").select("id,name,email").eq("user_id", userData.user.id).maybeSingle();
    const { data: coach } = profile?.id
      ? await supabase.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
      : { data: null };
    if (!coach?.id) return;
    setCoachInfo({ id: coach.id, name: profile?.name || "Coach FitMind", email: profile?.email || "", specialty: "Avaliação corporal" });
    // Paginate to bypass Supabase's default 1000-row limit
    const PAGE = 1000;
    let from = 0;
    const all: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from("coach_evaluation_clients" as never)
        .select("*, coach_body_assessments(*)" as never)
        .eq("coach_id" as never, coach.id as never)
        .order("created_at" as never, { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) return toast.error("Erro ao carregar alunos da avaliação");
      const rows = (data as any[]) || [];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    setClients(all.map((row) => ({
      id: row.id,
      name: row.name,
      gender: row.gender,
      ethnicity: row.ethnicity,
      height: Number(row.height || 0),
      heightUnit: row.height_unit,
      birthDate: row.birth_date || "",
      language: row.language,
      whatsapp: row.whatsapp || "",
      email: row.email || "",
      notes: row.notes || "",
      groups: row.groups || [],
      avatar: row.avatar_url || undefined,
      assessments: (row.coach_body_assessments || []).map(mapAssessment),
    })));
  };

  useEffect(() => { loadClients(); }, []);

  const createClient = async (client: Omit<FitMindClient, "id">) => {
    if (!coachInfo.id) throw new Error("Coach não encontrado");
    if (!client.name?.trim()) throw new Error("Informe o nome do aluno");
    const { data, error } = await supabase.from("coach_evaluation_clients" as never).insert({
      coach_id: coachInfo.id,
      name: client.name.trim().slice(0, 120),
      gender: client.gender,
      ethnicity: client.ethnicity,
      height: client.height || null,
      height_unit: client.heightUnit || "cm",
      birth_date: client.birthDate || null,
      language: client.language || "pt",
      whatsapp: client.whatsapp?.slice(0, 24) || null,
      email: client.email?.trim().slice(0, 255) || null,
      notes: client.notes?.slice(0, 1000) || null,
      groups: client.groups || [],
      avatar_url: client.avatar || null,
    } as never).select("*" as never).single();
    if (error) { toast.error("Erro ao criar aluno"); throw error; }
    toast.success("Aluno criado");
    const created = data as any;
    const mapped: FitMindClient = { id: created.id, name: created.name, gender: created.gender, ethnicity: created.ethnicity, height: Number(created.height || 0), heightUnit: created.height_unit, birthDate: created.birth_date || "", language: created.language, whatsapp: created.whatsapp || "", email: created.email || "", notes: created.notes || "", groups: created.groups || [], assessments: [] };
    setClients((current) => [mapped, ...current]);
    return mapped;
  };

  const saveAssessment = async (assessment: FitMindAssessment, client: FitMindClient) => {
    if (!coachInfo.id) throw new Error("Coach não encontrado");
    const nz = (v: any) => (v === "" || v === undefined ? null : v);
    const num = (v: any) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const payload: Record<string, any> = {
      client_id: client.id,
      coach_id: coachInfo.id,
      assessment_date: assessment.date || new Date().toISOString(),
      method: assessment.method || "bioimpedance",
      age: num(assessment.age),
      height: num(assessment.height),
      weight: num(assessment.weight),
      bmi: num(assessment.bmi),
      body_fat: num(assessment.bodyFat),
      skeletal_muscle: num(assessment.skeletalMuscle),
      muscle_mass: num(assessment.muscleMass),
      visceral_fat: num(assessment.visceralFat),
      basal_metabolism: num(assessment.basalMetabolism),
      body_age: num(assessment.bodyAge),
      body_water: num(assessment.bodyWater),
      bone_mass: num(assessment.boneMass),
      segment_analysis: assessment.segmentAnalysis || {},
      systolic_bp: num(assessment.systolicBP),
      diastolic_bp: num(assessment.diastolicBP),
      heart_rate: num(assessment.heartRate),
      blood_glucose: num(assessment.bloodGlucose),
      client_notes: nz(assessment.clientNotes),
      professional_notes: nz(assessment.professionalNotes),
      photos: assessment.photos || {},
      next_assessment_date: nz(assessment.nextAssessmentDate),
      next_assessment_time: nz(assessment.nextAssessmentTime),
      group_id: nz(assessment.groupId),
    };
    const { error } = await supabase.from("coach_body_assessments" as never).insert(payload as never);
    if (error) {
      console.error("saveAssessment error:", error);
      toast.error(error.message || "Erro ao salvar avaliação");
      throw error;
    }
    toast.success("Avaliação salva");
    await loadClients();
  };

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Avaliar Aluno</h1>
          <p className="text-sm text-white/50">Registre bioimpedância, anamnese e evolução</p>
        </div>
        {coachInfo.id && <FineshapeImport coachId={coachInfo.id} onDone={loadClients} />}
      </div>
      <FitMindShape
        coach={coachInfo}
        clients={clients}
        onCreateClient={createClient}
        onUpdateClient={async (client) => {
          if (!coachInfo.id) throw new Error("Coach não encontrado");
          if (!client.name?.trim()) throw new Error("Informe o nome do aluno");
          const { data, error } = await supabase
            .from("coach_evaluation_clients" as never)
            .update({
              name: client.name.trim().slice(0, 120),
              gender: client.gender,
              ethnicity: client.ethnicity,
              height: client.height || null,
              height_unit: client.heightUnit || "cm",
              birth_date: client.birthDate || null,
              language: client.language || "pt",
              whatsapp: client.whatsapp?.slice(0, 24) || null,
              email: client.email?.trim().slice(0, 255) || null,
              notes: client.notes?.slice(0, 1000) || null,
              groups: client.groups || [],
              avatar_url: client.avatar || null,
            } as never)
            .eq("id" as never, client.id as never)
            .eq("coach_id" as never, coachInfo.id as never)
            .select("*" as never)
            .single();
          if (error) { toast.error("Erro ao atualizar aluno"); throw error; }
          toast.success("Aluno atualizado");
          const updated = data as any;
          const mapped: FitMindClient = {
            id: updated.id,
            name: updated.name,
            gender: updated.gender,
            ethnicity: updated.ethnicity,
            height: Number(updated.height || 0),
            heightUnit: updated.height_unit,
            birthDate: updated.birth_date || "",
            language: updated.language,
            whatsapp: updated.whatsapp || "",
            email: updated.email || "",
            notes: updated.notes || "",
            groups: updated.groups || [],
            avatar: updated.avatar_url || undefined,
            assessments: client.assessments || [],
          };
          setClients((current) => current.map((it) => (it.id === mapped.id ? mapped : it)));
          return mapped;
        }}
        onSaveAssessment={saveAssessment}
        onDeleteAssessment={async (assessmentId, reason, client) => {
          if (!coachInfo.id) throw new Error("Coach não encontrado");
          if (!reason?.trim()) throw new Error("Motivo obrigatório");
          const target = client.assessments?.find((a) => a.id === assessmentId);
          const { error: logErr } = await supabase
            .from("coach_assessment_deletions" as never)
            .insert({
              coach_id: coachInfo.id,
              client_id: client.id,
              client_name: client.name,
              assessment_id: assessmentId,
              assessment_date: target?.date || null,
              reason: reason.trim().slice(0, 1000),
              snapshot: (target as any) || {},
            } as never);
          if (logErr) { toast.error("Não foi possível registrar o motivo"); throw logErr; }
          const { data: deletedRows, error: delErr } = await supabase
            .from("coach_body_assessments" as never)
            .delete()
            .eq("id" as never, assessmentId as never)
            .eq("coach_id" as never, coachInfo.id as never)
            .select("id" as never);
          if (delErr) { toast.error("Erro ao excluir avaliação"); throw delErr; }
          if (!deletedRows || (deletedRows as any[]).length === 0) {
            const err = new Error("A avaliação não foi removida. Atualize a tela e tente novamente.");
            toast.error(err.message);
            throw err;
          }
          setClients((current) =>
            current.map((item) =>
              item.id === client.id
                ? { ...item, assessments: (item.assessments || []).filter((a) => a.id !== assessmentId) }
                : item,
            ),
          );
          toast.success("Avaliação excluída");
          await loadClients();
        }}
        onEditAssessment={async (updated, client) => {
          if (!coachInfo.id) throw new Error("Coach não encontrado");
          const num = (v: any) => {
            if (v === "" || v === null || v === undefined) return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };
          const nz = (v: any) => (v === "" || v === undefined ? null : v);
          const payload: Record<string, any> = {
            assessment_date: updated.date || new Date().toISOString(),
            age: num(updated.age),
            height: num(updated.height),
            weight: num(updated.weight),
            bmi: num(updated.bmi),
            body_fat: num(updated.bodyFat),
            skeletal_muscle: num(updated.skeletalMuscle),
            muscle_mass: num(updated.muscleMass),
            visceral_fat: num(updated.visceralFat),
            basal_metabolism: num(updated.basalMetabolism),
            body_age: num(updated.bodyAge),
            body_water: num(updated.bodyWater),
            bone_mass: num(updated.boneMass),
            systolic_bp: num(updated.systolicBP),
            diastolic_bp: num(updated.diastolicBP),
            heart_rate: num(updated.heartRate),
            blood_glucose: num(updated.bloodGlucose),
            client_notes: nz(updated.clientNotes),
            professional_notes: nz(updated.professionalNotes),
          };
          const { error } = await supabase
            .from("coach_body_assessments" as never)
            .update(payload as never)
            .eq("id" as never, updated.id as never)
            .eq("coach_id" as never, coachInfo.id as never);
          if (error) { toast.error(error.message || "Erro ao atualizar avaliação"); throw error; }
          toast.success("Avaliação atualizada");
          await loadClients();
        }}
        onSearchClients={async (query) => clients.filter((client) => `${client.name} ${client.email}`.toLowerCase().includes(query.toLowerCase()))}
        onCreateGoogleCalendarEvent={async (date, time, clientName, eventName) => {
          try {
            const startISO = new Date(`${date}T${time}:00`).toISOString();
            const endISO = new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();
            const client = clients.find((c) => c.name === clientName);
            const summary = (eventName && eventName.trim()) || `Avaliação — ${clientName}`;
            const res = await createCoachCalendarEvent({
              data: {
                summary,
                description: "Avaliação física agendada via FitMind",
                startISO,
                endISO,
                attendeeEmail: client?.email ?? null,
                attendeeName: clientName,
              },
            });
            if (!res.connected) {
              toast.error("Conecte sua conta Google para agendar o evento.", {
                duration: 10000,
                action: { label: "Conectar agora", onClick: () => openGoogleConnectPopup() },
              });
              return { ok: false, error: "not_connected" };
            }
            return { ok: true, htmlLink: res.htmlLink ?? null };
          } catch (e: any) {
            console.error("createCoachCalendarEvent error:", e);
            return { ok: false, error: e?.message || "Erro ao criar evento" };
          }
        }}
        groups={[
          { id: "challenge", name: "Desafio 30 Dias", color: "#dc2626" },
          { id: "premium", name: "Alunos Premium", color: "#991b1b" },
        ]}
        themeColor="#dc2626"
        themeFontFamily="inherit"
      />
    </>
  );
}

export default EvaluateTab;
