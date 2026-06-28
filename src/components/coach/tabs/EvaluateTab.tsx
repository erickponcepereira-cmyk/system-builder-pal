import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import FitMindShape, { type FitMindAssessment, type FitMindClient } from "@/components/coach/FitMindShape";
import { createCoachCalendarEvent } from "@/lib/google-calendar.functions";
import FineshapeImport from "@/components/coach/FineshapeImport";
import { Trophy } from "lucide-react";

// Light assessment columns — enough for list counts, history charts & last-assessment summary.
// Heavy jsonb (segment_analysis, photos) and free-text notes are lazy-loaded on selection.
const ASSESSMENT_LIGHT_COLS =
  "id,client_id,assessment_date,method,age,height,weight,bmi,body_fat,skeletal_muscle,muscle_mass,visceral_fat,basal_metabolism,body_age,body_water,bone_mass,systolic_bp,diastolic_bp,heart_rate,blood_glucose,next_assessment_date,next_assessment_time,group_id";

type ChallengeLink = {
  enrollmentId: string;
  type: "initial" | "final";
  studentId: string;
  studentName: string;
  compLabel: string;
  preferredClientId?: string;
};

export function EvaluateTab() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<FitMindClient[]>([]);
  const [coachInfo, setCoachInfo] = useState({ id: "", name: "Coach FitMind", email: "", specialty: "Avaliação corporal", phone: "", whatsapp: "", instagram: "", tiktok: "", website: "" });
  const [challengeLink, setChallengeLink] = useState<ChallengeLink | null>(null);
  const [isMaster, setIsMaster] = useState(false);


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
    const { data: profile } = await supabase.from("profiles").select("id,name,email,phone,instagram").eq("user_id", userData.user.id).maybeSingle();
    const { data: coach } = profile?.id
      ? await supabase.from("coaches").select("id,instagram,tiktok,website").eq("profile_id", profile.id).maybeSingle()
      : { data: null };
    if (!coach?.id) return;
    const p: any = profile || {};
    const c: any = coach || {};
    setCoachInfo({
      id: coach.id,
      name: p.name || "Coach FitMind",
      email: p.email || "",
      specialty: "Avaliação corporal",
      phone: p.phone || "",
      whatsapp: p.phone || "",
      instagram: c.instagram || p.instagram || "",
      tiktok: c.tiktok || "",
      website: c.website || "",
    });

    // Master coach? Uses the official category rule shared with sales/network flows.
    const { data: masterResult } = await supabase
      .rpc("is_master_coach" as never, { _coach_id: coach.id } as never);
    const masterFlag = !!masterResult;
    setIsMaster(masterFlag);

    // Paginate to bypass Supabase's default 1000-row limit.
    // PERF: do NOT join coach_body_assessments here — that pulled ~13k rows with heavy jsonb
    // (photos / segment_analysis) and caused ~30s loads on master coach view. We fetch only
    // client metadata here, then a separate lightweight assessment summary, then lazy-load
    // the full per-assessment payload (photos/segments/notes) only when a client is opened.
    const PAGE = 1000;
    let from = 0;
    const all: any[] = [];
    while (true) {
      let q = supabase
        .from("coach_evaluation_clients" as never)
        .select("id,coach_id,name,gender,ethnicity,height,height_unit,birth_date,language,whatsapp,email,notes,groups,avatar_url,created_at" as never)
        .order("created_at" as never, { ascending: false })
        .range(from, from + PAGE - 1);
      if (!masterFlag) {
        q = q.eq("coach_id" as never, coach.id as never);
      }
      const { data, error } = await q;
      if (error) return toast.error("Erro ao carregar alunos da avaliação");
      const rows = (data as any[]) || [];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }

    // Lightweight assessments (no jsonb / notes). Page through to bypass 1000-row limit.
    const assessmentsByClient = new Map<string, any[]>();
    {
      let aFrom = 0;
      while (true) {
        let aq = supabase
          .from("coach_body_assessments" as never)
          .select(ASSESSMENT_LIGHT_COLS as never)
          .order("assessment_date" as never, { ascending: false })
          .range(aFrom, aFrom + PAGE - 1);
        if (!masterFlag) {
          aq = aq.eq("coach_id" as never, coach.id as never);
        }
        const { data: aData, error: aErr } = await aq;
        if (aErr) break;
        const aRows = (aData as any[]) || [];
        aRows.forEach((r) => {
          const arr = assessmentsByClient.get(r.client_id) || [];
          arr.push(r);
          assessmentsByClient.set(r.client_id, arr);
        });
        if (aRows.length < PAGE) break;
        aFrom += PAGE;
      }
    }

    // Build coachId -> coachName map (only needed for master view)
    const coachNameById = new Map<string, string>();
    if (masterFlag) {
      const otherCoachIds = Array.from(new Set(all.map((r) => r.coach_id).filter((id) => id && id !== coach.id)));
      if (otherCoachIds.length) {
        const { data: coachesData } = await supabase
          .from("coaches")
          .select("id, profiles!coaches_profile_id_fkey(name)")
          .in("id", otherCoachIds);
        ((coachesData as any[]) || []).forEach((cc) => {
          coachNameById.set(cc.id, cc.profiles?.name || "Coach");
        });
      }
    }

    setClients(all.map((row) => ({
      id: row.id,
      coachId: row.coach_id,
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
      assessments: (assessmentsByClient.get(row.id) || []).map(mapAssessment),
      coachName: masterFlag && row.coach_id !== coach.id ? (coachNameById.get(row.coach_id) || "Outro coach") : undefined,
    })));
  };

  // Per-client cache of full assessment rows (photos + segments + notes).
  // Persists across re-renders; cleared after a save/edit/delete via loadClients().
  const fullAssessmentsCacheRef = useRef<Map<string, FitMindAssessment[]>>(new Map());

  const loadFullAssessmentsForClient = async (clientId: string): Promise<FitMindAssessment[]> => {
    const cached = fullAssessmentsCacheRef.current.get(clientId);
    if (cached) return cached;
    const { data, error } = await supabase
      .from("coach_body_assessments" as never)
      .select("*" as never)
      .eq("client_id" as never, clientId as never)
      .order("assessment_date" as never, { ascending: false });
    if (error) {
      toast.error("Erro ao carregar avaliações do aluno");
      return [];
    }
    const mapped = ((data as any[]) || []).map(mapAssessment);
    fullAssessmentsCacheRef.current.set(clientId, mapped);
    return mapped;
  };

  useEffect(() => { loadClients(); }, []);

  // Read challenge link from URL (?challenge=<enrollmentId>&type=initial|final&studentId=<id>)
  useEffect(() => {
    if (!coachInfo.id) return;
    (async () => {
      const sp = new URLSearchParams(window.location.search);
      const enrollmentId = sp.get("challenge");
      const type = sp.get("type") as "initial" | "final" | null;
      const studentId = sp.get("studentId");
      if (!enrollmentId || !type || !studentId) return;
      const { data: enroll } = await supabase
        .from("competition_enrollments" as never)
        .select("id, student:student_id ( id, profile:profile_id ( name ) ), competition:competition_id ( month, year )")
        .eq("id" as never, enrollmentId)
        .maybeSingle();
      const e = enroll as any;
      if (!e) return;
      const studentName = e.student?.profile?.name || "Aluno";
      const months = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      const compLabel = `${months[e.competition?.month || 1]}/${e.competition?.year || ""}`;

      // Find or create a coach_evaluation_clients row linked to this student
      let preferredClientId: string | undefined;
      const { data: existing } = await supabase
        .from("coach_evaluation_clients" as never)
        .select("id")
        .eq("coach_id" as never, coachInfo.id as never)
        .eq("student_id" as never, studentId as never)
        .maybeSingle();
      if (existing) {
        preferredClientId = (existing as any).id;
      } else {
        const { data: st } = await supabase
          .from("students" as never)
          .select("gender, height, current_weight, profile:profile_id ( name, email, phone, avatar_url )")
          .eq("id" as never, studentId as never)
          .maybeSingle();
        const s = st as any;
        const { data: created } = await supabase
          .from("coach_evaluation_clients" as never)
          .insert({
            coach_id: coachInfo.id,
            student_id: studentId,
            name: s?.profile?.name || studentName,
            gender: s?.gender === "F" ? "female" : s?.gender === "M" ? "male" : "other",
            height: s?.height || null,
            height_unit: "cm",
            language: "pt",
            whatsapp: s?.profile?.phone || null,
            email: s?.profile?.email || null,
            avatar_url: s?.profile?.avatar_url || null,
            groups: ["challenge"],
          } as never)
          .select("id")
          .single();
        preferredClientId = (created as any)?.id;
        await loadClients();
      }
      setChallengeLink({ enrollmentId, type, studentId, studentName, compLabel, preferredClientId });
    })();
  }, [coachInfo.id]);



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
    const targetCoachId = (isMaster && (client as any).coachId) ? (client as any).coachId : coachInfo.id;
    const nz = (v: any) => (v === "" || v === undefined ? null : v);
    const num = (v: any) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const int = (v: any) => {
      const n = num(v);
      return n === null ? null : Math.round(n);
    };
    const payload: Record<string, any> = {
      client_id: client.id,
      coach_id: targetCoachId,
      assessment_date: assessment.date || new Date().toISOString(),
      method: assessment.method || "bioimpedance",
      age: int(assessment.age),
      height: num(assessment.height),
      weight: num(assessment.weight),
      bmi: num(assessment.bmi),
      body_fat: num(assessment.bodyFat),
      skeletal_muscle: num(assessment.skeletalMuscle),
      muscle_mass: num(assessment.muscleMass),
      visceral_fat: num(assessment.visceralFat),
      basal_metabolism: int(assessment.basalMetabolism),
      body_age: int(assessment.bodyAge),
      body_water: num(assessment.bodyWater),
      bone_mass: num(assessment.boneMass),
      segment_analysis: assessment.segmentAnalysis || {},
      systolic_bp: int(assessment.systolicBP),
      diastolic_bp: int(assessment.diastolicBP),
      heart_rate: int(assessment.heartRate),
      blood_glucose: num(assessment.bloodGlucose),
      client_notes: nz(assessment.clientNotes),
      professional_notes: nz(assessment.professionalNotes),
      photos: assessment.photos || {},
      next_assessment_date: nz(assessment.nextAssessmentDate),
      next_assessment_time: nz(assessment.nextAssessmentTime),
      group_id: nz(assessment.groupId),
    };
    if (challengeLink && client.id === challengeLink.preferredClientId) {
      payload.student_id = challengeLink.studentId;
      payload.challenge_enrollment_id = challengeLink.enrollmentId;
      payload.challenge_type = challengeLink.type;
    } else if ((client as any).studentId) {
      payload.student_id = (client as any).studentId;
    }
    const { data: inserted, error } = await supabase
      .from("coach_body_assessments" as never)
      .insert(payload as never)
      .select("id" as never)
      .single();
    if (error) {
      console.error("saveAssessment error:", error);
      toast.error(error.message || "Erro ao salvar avaliação");
      throw error;
    }
    if (challengeLink && client.id === challengeLink.preferredClientId) {
      toast.success(`Avaliação vinculada ao Desafio (${challengeLink.type === "initial" ? "Pesagem Inicial" : "Pesagem Final"})`);
      setTimeout(() => navigate({ to: "/coach", search: { tab: "challenge" } as any }), 800);
    } else {
      toast.success("Avaliação salva");
    }
    await loadClients();
    return (inserted as { id: string } | null)?.id;
  };



  return (
    <>
      {challengeLink && (
        <div className="mb-4 rounded-2xl border border-primary/40 bg-primary/10 p-4 flex items-start gap-3">
          <Trophy className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-bold text-foreground">
              Vinculado ao Desafio FitMind · {challengeLink.compLabel} · Pesagem {challengeLink.type === "initial" ? "Inicial" : "Final"}
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Aluno: <b>{challengeLink.studentName}</b>. Selecione esse aluno na lista do FitMindShape e finalize a avaliação — peso, % gordura e link compartilhável serão salvos automaticamente no desafio.
            </p>
          </div>
          <button onClick={() => setChallengeLink(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-white">Avaliar Aluno</h1>
            {isMaster && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/40">
                Master Coach · acesso a todos os alunos
              </span>
            )}
          </div>
          <p className="text-sm text-white/50">
            {isMaster
              ? "Você pode avaliar alunos de qualquer coach da rede. O coach titular aparece no card do aluno."
              : "Registre bioimpedância, anamnese e evolução"}
          </p>
        </div>
        {coachInfo.id && <FineshapeImport coachId={coachInfo.id} onDone={loadClients} />}
      </div>
      <FitMindShape
        coach={coachInfo}
        clients={clients}
        initialClientId={challengeLink?.preferredClientId}
        onLoadFullAssessments={loadFullAssessmentsForClient}
        onCreateClient={createClient}
        onUpdateClient={async (client) => {
          if (!coachInfo.id) throw new Error("Coach não encontrado");
          if (!client.name?.trim()) throw new Error("Informe o nome do aluno");
          const targetCoachId = (isMaster && (client as any).coachId) ? (client as any).coachId : coachInfo.id;
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
            .eq("coach_id" as never, targetCoachId as never)
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
            coachId: (updated as any).coach_id || (client as any).coachId,
            coachName: (client as any).coachName,
          };
          setClients((current) => current.map((it) => (it.id === mapped.id ? mapped : it)));
          return mapped;
        }}
        onSaveAssessment={saveAssessment}
        onDeleteAssessment={async (assessmentId, reason, client) => {
          if (!coachInfo.id) throw new Error("Coach não encontrado");
          if (!reason?.trim()) throw new Error("Motivo obrigatório");
          const targetCoachId = (isMaster && (client as any).coachId) ? (client as any).coachId : coachInfo.id;
          const target = client.assessments?.find((a) => a.id === assessmentId);
          const { error: logErr } = await supabase
            .from("coach_assessment_deletions" as never)
            .insert({
              coach_id: targetCoachId,
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
            .eq("coach_id" as never, targetCoachId as never)
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
          const targetCoachId = (isMaster && (client as any).coachId) ? (client as any).coachId : coachInfo.id;
          const num = (v: any) => {
            if (v === "" || v === null || v === undefined) return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };
          const int = (v: any) => {
            const n = num(v);
            return n === null ? null : Math.round(n);
          };
          const nz = (v: any) => (v === "" || v === undefined ? null : v);
          const payload: Record<string, any> = {
            assessment_date: updated.date || new Date().toISOString(),
            age: int(updated.age),
            height: num(updated.height),
            weight: num(updated.weight),
            bmi: num(updated.bmi),
            body_fat: num(updated.bodyFat),
            skeletal_muscle: num(updated.skeletalMuscle),
            muscle_mass: num(updated.muscleMass),
            visceral_fat: num(updated.visceralFat),
            basal_metabolism: int(updated.basalMetabolism),
            body_age: int(updated.bodyAge),
            body_water: num(updated.bodyWater),
            bone_mass: num(updated.boneMass),
            client_notes: nz(updated.clientNotes),
            professional_notes: nz(updated.professionalNotes),
            photos: updated.photos || {},
          };
          const { error } = await supabase
            .from("coach_body_assessments" as never)
            .update(payload as never)
            .eq("id" as never, updated.id as never)
            .eq("coach_id" as never, targetCoachId as never);
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
