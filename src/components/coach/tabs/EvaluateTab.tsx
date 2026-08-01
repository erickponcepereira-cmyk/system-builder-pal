import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import FitMindShape, { type FitMindAssessment, type FitMindClient } from "@/components/coach/FitMindShape";
import { linkFitmindAssessmentToChallenge } from "@/lib/fitmind-challenge.functions";
// Google Calendar desativado temporariamente — usando agenda interna
import FineshapeImport from "@/components/coach/FineshapeImport";
import { Trophy } from "lucide-react";

// PERF: no carregamento inicial usamos apenas contagem agregada por cliente (RPC).
// Payload completo por avaliação (photos, segment_analysis, notas) é lazy-loaded em
// loadFullAssessmentsForClient() só quando o aluno é aberto.

type ChallengeLink = {
  enrollmentId: string;
  type: "initial" | "final";
  studentId: string;
  studentName: string;
  compLabel: string;
  preferredClientId?: string;
};

type ChallengeCandidate = {
  enrollmentId: string;
  type: "initial" | "final";
  studentId: string;
  studentName: string;
  compLabel: string;
  groupNumber: number;
  coachId: string;
  coachName?: string;
  finalWeighInDate?: string | null;
};

const CLIENT_SUMMARY_CACHE_TTL_MS = 60_000;
const clientSummaryCache = new Map<string, { expiresAt: number; clients: FitMindClient[] }>();

export function EvaluateTab() {
  const navigate = useNavigate();
  const linkAssessmentToChallengeFn = useServerFn(linkFitmindAssessmentToChallenge);
  const [clients, setClients] = useState<FitMindClient[]>([]);
  const [coachInfo, setCoachInfo] = useState({ id: "", name: "Coach FitMind", email: "", specialty: "Avaliação corporal", phone: "", whatsapp: "", instagram: "", tiktok: "", website: "" });
  const [challengeLink, setChallengeLink] = useState<ChallengeLink | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [challengeCandidates, setChallengeCandidates] = useState<ChallengeCandidate[]>([]);
  // Modal: integrar cliente importado ao cadastro do aluno
  const [linkingClient, setLinkingClient] = useState<FitMindClient | null>(null);
  const [linkStudents, setLinkStudents] = useState<{ id: string; name: string; email?: string; coachName?: string }[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [challengeBannerOpen, setChallengeBannerOpen] = useState(false);
  // Confirmação irreversível de vinculação
  const [confirmLink, setConfirmLink] = useState<{
    client: FitMindClient;
    student: { id: string; name: string; email?: string };
    existingClientName?: string; // se aluno já vinculado a outro cliente
    existingClientId?: string;
  } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [transferMergeAndDelete, setTransferMergeAndDelete] = useState(true);
  // Per-client cache of full assessment rows (photos + segments + notes).
  // Persists across re-renders; cleared by loadClients() after save/edit/delete.
  const fullAssessmentsCacheRef = useRef<Map<string, FitMindAssessment[]>>(new Map());


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

  // openGoogleConnectPopup removido — Google Calendar desativado temporariamente


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
    scaleNumber: row.scale_number || undefined,
    nextAssessmentDate: row.next_assessment_date || undefined,
    nextAssessmentTime: row.next_assessment_time || undefined,
    groupId: row.group_id || undefined,
    challengeEnrollmentId: row.challenge_enrollment_id || undefined,
    challengeType: (row.challenge_type as "initial" | "final" | undefined) || undefined,
  });

  const loadClients = async () => {
    // Invalidate full-assessment cache so reloads after save/edit/delete see fresh data.
    fullAssessmentsCacheRef.current?.clear();
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

    // Garante uma ficha de avaliação para o próprio coach — permite que ele registre a própria avaliação
    try {
      // Usa `limit(1)` em vez de `maybeSingle()` porque o modo single retorna
      // erro quando já existem duplicatas (caso do bug "Ana Flávia (eu)" 5x),
      // fazendo o código pensar que não existe e inserir mais uma. Aqui só
      // criamos se realmente não houver NENHUM cadastro self do coach.
      const { data: existingSelf } = await supabase
        .from("coach_evaluation_clients" as never)
        .select("id" as never)
        .eq("coach_id" as never, coach.id as never)
        .is("student_id" as never, null as never)
        .ilike("name" as never, `${p.name || "Meu perfil"}%` as never)
        .limit(1);
      const hasSelf = Array.isArray(existingSelf) && existingSelf.length > 0;
      if (!hasSelf) {
        await supabase
          .from("coach_evaluation_clients" as never)
          .insert({
            coach_id: coach.id,
            name: `${p.name || "Meu perfil"} (eu)`,
            email: p.email || null,
            whatsapp: p.phone || null,
            language: "pt",
            gender: "other",
            groups: ["self"],
          } as never);
      }
    } catch (e) {
      console.warn("self-eval client bootstrap:", e);
    }


    const cacheKey = coach.id;
    const cached = clientSummaryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setClients(cached.clients);
      void loadChallengeCandidates(coach.id, masterFlag);
      return;
    }

    let all: any[] = [];
    try {
      const PAGE = 1000;
      let from = 0;
      // Paginate via PostgREST Range header to bypass the default 1000-row cap.
      // Loops until a partial page is returned, so master coaches see every client.
      // Each page has a small retry to survive transient "Failed to fetch" from the
      // preview fetch proxy; a total failure falls back to a single un-paginated call.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let chunk: any[] | null = null;
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 3 && chunk === null; attempt++) {
          try {
            const { data, error } = await supabase
              .rpc(
                "coach_evaluation_client_summaries" as never,
                { _coach_id: coach.id } as never,
              )
              .range(from, from + PAGE - 1);
            if (error) throw error;
            chunk = (data as any[]) || [];
          } catch (e) {
            lastErr = e;
            await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          }
        }
        if (chunk === null) throw lastErr;
        all = all.concat(chunk);
        if (chunk.length < PAGE) break;
        from += PAGE;
      }
    } catch (error) {
      console.error("coach_evaluation_client_summaries paginated failed, retrying single call:", error);
      try {
        const { data, error: err2 } = await supabase.rpc(
          "coach_evaluation_client_summaries" as never,
          { _coach_id: coach.id } as never,
        );
        if (err2) throw err2;
        all = (data as any[]) || [];
      } catch (fallbackErr) {
        console.error("coach_evaluation_client_summaries fallback:", fallbackErr);
        return toast.error("Erro ao carregar alunos da avaliação");
      }
    }

    const mappedClients = all.map((row) => {
      const total = Number(row.assessment_count || 0);
      const lastAt = row.last_assessment_at || null;
      // Stub avaliações apenas com id/date para a lista mostrar contagem e "última" —
      // dados completos (fotos, notas, segmentos) são carregados sob demanda ao abrir o aluno.
      const stubs: FitMindAssessment[] = total > 0
        ? Array.from({ length: total }, (_, i) => ({
            id: `__stub_${row.id}_${i}`,
            clientId: row.id,
            date: (i === total - 1 && lastAt) ? lastAt : "",
            method: "bioimpedance",
            age: 0, height: 0, weight: 0, bmi: 0, bodyFat: 0,
            skeletalMuscle: 0, muscleMass: 0, visceralFat: 0, basalMetabolism: 0,
            bodyAge: 0, bodyWater: 0, boneMass: 0,
          } as FitMindAssessment))
        : [];
      return {
        id: row.id,
        coachId: row.coach_id,
        studentId: row.student_id || undefined,
        name: row.name,
        gender: row.gender,
        ethnicity: row.ethnicity,
        height: Number(row.height || 0),
        heightUnit: row.height_unit,
        birthDate: row.birth_date || "",
        language: row.language,
        whatsapp: "",
        email: "",
        notes: "",
        groups: row.groups || [],
        avatar: row.avatar_url || undefined,
        assessments: stubs,
        coachName: masterFlag && row.coach_id !== coach.id ? (row.coach_name || "Outro coach") : undefined,
      };
    });

    // Dedup: consolida cadastros duplicados por (studentId) quando existe
    // vínculo, ou por (coach_id + nome normalizado) quando é "self" sem
    // student_id. Mantém o mais antigo (menor id lexicográfico como fallback)
    // e junta contagens de avaliações. Corrige duplicatas visíveis como
    // "Ana Flávia (eu)" e cadastros do mesmo aluno em coaches diferentes.
    const normalize = (s: string) =>
      (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
    const dedupMap = new Map<string, typeof mappedClients[number]>();
    for (const c of mappedClients) {
      const key = c.studentId
        ? `sid:${c.studentId}`
        : `self:${c.coachId}:${normalize(c.name)}`;
      const prev = dedupMap.get(key);
      if (!prev) {
        dedupMap.set(key, c);
      } else {
        // Mescla assessments (mantém stubs para contagem correta)
        const merged = [...(prev.assessments || []), ...(c.assessments || [])];
        dedupMap.set(key, { ...prev, assessments: merged });
      }
    }
    const deduped = Array.from(dedupMap.values());
    clientSummaryCache.set(cacheKey, { expiresAt: Date.now() + CLIENT_SUMMARY_CACHE_TTL_MS, clients: deduped });
    setClients(deduped);

    // Carrega vagas pendentes de desafio para exibir botão "Avaliar para o Desafio"
    void loadChallengeCandidates(coach.id, masterFlag);
  };

  const loadChallengeCandidates = async (coachId: string, master: boolean) => {
    let q = supabase
      .from("competition_enrollments" as never)
      .select(`
        id, status, coach_id, initial_weight, final_weight,
        student:student_id ( id, profile:profile_id ( name ) ),
        competition:competition_id ( month, year ),
        group:group_id ( group_number, initial_start_date, initial_end_date, final_weigh_in_date )
      `)
      .not("status" as never, "in" as never, "(weighed_final,cancelled)" as never)
      .limit(500);
    if (!master) q = q.eq("coach_id" as never, coachId as never);
    const { data, error } = await q;
    if (error) { console.warn("challenge candidates:", error); return; }
    const months = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const today = new Date(); today.setHours(0,0,0,0);
    const out: ChallengeCandidate[] = [];
    for (const r of (data as any[]) || []) {
      const g = r.group || {};
      const startD = g.initial_start_date ? new Date(g.initial_start_date + "T00:00:00") : null;
      const finalD = g.final_weigh_in_date ? new Date(g.final_weigh_in_date + "T23:59:59") : null;
      // Janela: do início da pesagem inicial até 7 dias após pesagem final
      const grace = finalD ? new Date(finalD.getTime() + 7*86400000) : null;
      if (startD && today < startD) continue;
      if (grace && today > grace) continue;
      const compLabel = `${months[r.competition?.month || 1]}/${r.competition?.year || ""}`;
      const base = {
        enrollmentId: r.id,
        studentId: r.student?.id,
        studentName: r.student?.profile?.name || "Aluno",
        compLabel,
        groupNumber: g.group_number || 0,
        coachId: r.coach_id,
        finalWeighInDate: g.final_weigh_in_date || null,
      };
      if (!base.studentId) continue;
      // Pesagem inicial pendente
      if (!r.initial_weight && ["enrolled","scheduled_initial"].includes(r.status)) {
        out.push({ ...base, type: "initial" });
      }
      // Pesagem final pendente (requer inicial feita)
      if (r.initial_weight && !r.final_weight && ["weighed_initial","scheduled_final"].includes(r.status)) {
        out.push({ ...base, type: "final" });
      }
    }
    // Coach names (para master)
    if (master && out.length) {
      const ids = Array.from(new Set(out.map(o => o.coachId).filter(id => id && id !== coachId)));
      if (ids.length) {
        const { data: cs } = await supabase
          .from("coaches")
          .select("id, profiles!coaches_profile_id_fkey(name)")
          .in("id", ids);
        const map = new Map<string,string>();
        ((cs as any[]) || []).forEach(c => map.set(c.id, c.profiles?.name || "Coach"));
        out.forEach(o => { if (o.coachId !== coachId) o.coachName = map.get(o.coachId); });
      }
    }
    setChallengeCandidates(out);
  };


  const loadFullAssessmentsForClient = async (clientId: string): Promise<FitMindAssessment[]> => {
    const cached = fullAssessmentsCacheRef.current.get(clientId);
    if (cached) return cached;
    // Se o cliente estiver vinculado a um aluno, busca por student_id — assim
    // qualquer avaliação registrada em fichas duplicadas (legado) ou por
    // outro coach (master coach) ainda aparece no histórico consolidado.
    const client = clients.find((c) => c.id === clientId);
    const studentId = client?.studentId;
    const query = supabase
      .from("coach_body_assessments" as never)
      .select("*" as never)
      .order("assessment_date" as never, { ascending: false });
    const { data, error } = studentId
      ? await query.eq("student_id" as never, studentId as never)
      : await query.eq("client_id" as never, clientId as never);
    if (error) {
      toast.error("Erro ao carregar avaliações do aluno");
      return [];
    }
    const mapped = ((data as any[]) || []).map(mapAssessment);
    fullAssessmentsCacheRef.current.set(clientId, mapped);
    return mapped;
  };

  const loadFullClient = async (client: FitMindClient): Promise<FitMindClient> => {
    const { data, error } = await supabase
      .from("coach_evaluation_clients" as never)
      .select("whatsapp,email,notes" as never)
      .eq("id" as never, client.id as never)
      .maybeSingle();
    if (error) {
      toast.error("Erro ao carregar dados do aluno");
      return client;
    }
    const row = (data as any) || {};
    return {
      ...client,
      whatsapp: row.whatsapp || "",
      email: row.email || "",
      notes: row.notes || "",
    };
  };

  useEffect(() => { loadClients(); }, []);

  // Vincula uma vaga do desafio (garante evaluation-client, seta challengeLink)
  const linkChallengeCandidate = async (args: {
    enrollmentId: string; type: "initial" | "final"; studentId: string; studentName?: string; compLabel?: string;
  }) => {
    if (!coachInfo.id) return;
    const { enrollmentId, type, studentId } = args;
    let studentName = args.studentName;
    let compLabel = args.compLabel;
    if (!studentName || !compLabel) {
      const { data: enroll } = await supabase
        .from("competition_enrollments" as never)
        .select("id, student:student_id ( id, profile:profile_id ( name ) ), competition:competition_id ( month, year )")
        .eq("id" as never, enrollmentId)
        .maybeSingle();
      const e = enroll as any;
      if (!e) { toast.error("Inscrição não encontrada"); return; }
      studentName = studentName || e.student?.profile?.name || "Aluno";
      const months = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      compLabel = compLabel || `${months[e.competition?.month || 1]}/${e.competition?.year || ""}`;
    }
    // Find or create a coach_evaluation_clients row linked to this student (para ESTE coach)
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
      clientSummaryCache.delete(coachInfo.id);
      await loadClients();
    }
    setChallengeLink({ enrollmentId, type, studentId, studentName: studentName!, compLabel: compLabel!, preferredClientId });
    // Scroll para o topo pra o FitMindShape auto-selecionar
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100);
  };

  // Read challenge link from URL (?challenge=<enrollmentId>&type=initial|final&studentId=<id>)
  useEffect(() => {
    if (!coachInfo.id) return;
    const sp = new URLSearchParams(window.location.search);
    const enrollmentId = sp.get("challenge");
    const type = sp.get("type") as "initial" | "final" | null;
    const studentId = sp.get("studentId");
    if (!enrollmentId || !type || !studentId) return;
    linkChallengeCandidate({ enrollmentId, type, studentId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    clientSummaryCache.delete(coachInfo.id);
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
      scale_number: nz(assessment.scaleNumber)?.slice(0, 50),
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
    // PERF: em vez de refazer loadClients() (~1min no master coach), atualiza só o cliente afetado.
    const newId = (inserted as { id: string } | null)?.id;
    if (newId) {
      const newAssessment: FitMindAssessment = { ...assessment, id: newId, clientId: client.id };
      // Invalida cache do full-load para forçar próxima abertura a puxar os dados reais.
      fullAssessmentsCacheRef.current.delete(client.id);
      setClients((current) => current.map((c) => {
        if (c.id !== client.id) return c;
        const existing = (c.assessments || []).filter((a) => !a.id.startsWith("__stub_"));
        const stubCount = (c.assessments || []).length - existing.length;
        // se ainda estava só com stubs, mantém a contagem certa (stubCount + 1)
        const nextAssessments = existing.length > 0
          ? [...existing, newAssessment]
          : Array.from({ length: stubCount + 1 }, (_, i) => (
              i < stubCount
                ? { id: `__stub_${c.id}_${i}`, clientId: c.id, date: "", method: "bioimpedance", age: 0, height: 0, weight: 0, bmi: 0, bodyFat: 0, skeletalMuscle: 0, muscleMass: 0, visceralFat: 0, basalMetabolism: 0, bodyAge: 0, bodyWater: 0, boneMass: 0 } as FitMindAssessment
                : newAssessment
            ));
        return { ...c, assessments: nextAssessments };
      }));
      clientSummaryCache.delete(coachInfo.id);
    }
    return newId;
  };


  // ─── Integrar cliente importado (Fineshape) a um aluno cadastrado ──────────
  // Busca server-side. Quando há termo, buscamos primeiro os profiles que
  // batem (name/email) e depois os students associados — o filtro embed do
  // PostgREST via `foreignTable` retorna vazio silenciosamente quando o join
  // não é forçado como INNER. Ver bug de busca em branco no modal Integrar.
  const runLinkSearch = async (term: string) => {
    if (!coachInfo.id) return;
    setLinkLoading(true);
    try {
      const t = term.trim();
      const normalize = (s: string) =>
        (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

      // Sem termo: pega os N mais recentes do escopo do coach.
      if (!t) {
        let q = supabase
          .from("students")
          .select("id,coach_id,profile_id,profiles!inner(name,email)")
          .order("created_at", { ascending: false })
          .limit(30);
        if (!isMaster) q = q.eq("coach_id", coachInfo.id);
        const { data, error } = await q;
        if (error) throw error;
        await hydrateLinkStudents((data as any[]) || []);
        return;
      }

      // Com termo: primeiro pega profiles que batem (name/email),
      // depois busca students que apontam para esses profiles.
      const like = `%${t.replace(/[%_]/g, "\\$&")}%`;
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id,name,email")
        .or(`name.ilike.${like},email.ilike.${like}`)
        .limit(50);
      if (pErr) throw pErr;
      const profileIds = ((profs as any[]) || []).map((p) => p.id).filter(Boolean);
      if (profileIds.length === 0) {
        setLinkStudents([]);
        return;
      }
      let sq = supabase
        .from("students")
        .select("id,coach_id,profile_id,profiles!inner(name,email)")
        .in("profile_id", profileIds)
        .limit(100);
      if (!isMaster) sq = sq.eq("coach_id", coachInfo.id);
      const { data: rows, error: sErr } = await sq;
      if (sErr) throw sErr;

      // Filtro cliente-side defensivo (case/diacritic-insensitive).
      const nq = normalize(t);
      const filtered = ((rows as any[]) || []).filter((r) => {
        const n = normalize(r.profiles?.name || "");
        const e = normalize(r.profiles?.email || "");
        return n.includes(nq) || e.includes(nq);
      });
      await hydrateLinkStudents(filtered);
    } catch (e: any) {
      console.error("[LinkSearch] erro:", e, "term:", term);
      toast.error("Erro ao buscar alunos do sistema");
    } finally {
      setLinkLoading(false);
    }
  };

  const hydrateLinkStudents = async (rows: any[]) => {
    const coachIds = Array.from(new Set(rows.map((r) => r.coach_id).filter(Boolean)));
    const coachMap = new Map<string, string>();
    if (coachIds.length) {
      const { data: cs } = await supabase
        .from("coaches")
        .select("id, profiles!coaches_profile_id_fkey(name)")
        .in("id", coachIds);
      ((cs as any[]) || []).forEach((c) => coachMap.set(c.id, (c as any).profiles?.name || "Coach"));
    }
    const list = rows
      .filter((r) => r.profiles?.name)
      .map((r) => ({
        id: r.id as string,
        name: (r.profiles?.name as string) || "Aluno",
        email: (r.profiles?.email as string) || undefined,
        coachName: coachMap.get(r.coach_id) || (r.coach_id === coachInfo.id ? coachInfo.name : "—"),
      }));
    list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    setLinkStudents(list);
  };

  const openLinkClientModal = async (client: FitMindClient) => {
    if (!coachInfo.id) return;
    setLinkingClient(client);
    setLinkSearch("");
    setLinkStudents([]);
    await runLinkSearch("");
  };

  // Debounce da busca no modal
  useEffect(() => {
    if (!linkingClient) return;
    const t = setTimeout(() => { runLinkSearch(linkSearch); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkSearch, linkingClient]);

  // Passo 1: usuário escolheu um aluno na lista → checa duplicidade e abre confirmação
  const requestLinkClientToStudent = async (client: FitMindClient, student: { id: string; name: string; email?: string }) => {
    if (!coachInfo.id) return;
    try {
      // Verifica se este aluno já está vinculado a QUALQUER outro cadastro
      // (não só do coach atual — bug: vínculos antigos de outros coaches
      // permaneciam visíveis mesmo após integrar).
      const { data: existing, error: exErr } = await supabase
        .from("coach_evaluation_clients" as never)
        .select("id,name,coach_id" as never)
        .eq("student_id" as never, student.id as never)
        .neq("id" as never, client.id as never);
      if (exErr) throw exErr;
      const existingRows = (existing as any[]) || [];
      const existingClientName = existingRows[0]?.name;
      const existingClientId = existingRows[0]?.id;
      setConfirmText("");
      setTransferMergeAndDelete(true);
      setConfirmLink({
        client,
        student,
        existingClientName,
        existingClientId,
        existingClientIds: existingRows.map((r) => r.id),
      } as any);
    } catch (e: any) {
      console.error("[LinkRequest] erro:", e);
      toast.error(e?.message || "Erro ao verificar vinculação");
    }
  };

  // Passo 2: usuário confirmou digitando CONFIRMAR → executa a vinculação e registra auditoria
  const executeConfirmedLink = async () => {
    if (!confirmLink) return;
    if (confirmText.trim().toUpperCase() !== "CONFIRMAR") {
      toast.error("Digite CONFIRMAR para prosseguir.");
      return;
    }
    setConfirmBusy(true);
    const { client, student, existingClientId } = confirmLink;
    const existingClientIds: string[] = (confirmLink as any).existingClientIds
      || (existingClientId ? [existingClientId] : []);
    const isTransfer = existingClientIds.length > 0;
    try {
      const targetCoachId = (client as any).coachId || coachInfo.id;
      // Captura estado anterior para auditoria
      const { data: before } = await supabase
        .from("coach_evaluation_clients" as never)
        .select("student_id" as never)
        .eq("id" as never, client.id as never)
        .maybeSingle();
      const previousStudentId = (before as any)?.student_id ?? null;

      // Se transferência: mover avaliações de TODOS os cadastros antigos → novo
      if (isTransfer && existingClientIds.length > 0) {
        const { error: mvErr } = await supabase
          .from("coach_body_assessments" as never)
          .update({ client_id: client.id, student_id: student.id } as never)
          .in("client_id" as never, existingClientIds as never);
        if (mvErr) throw mvErr;
        // Apaga ou desvincula todos os cadastros antigos.
        if (transferMergeAndDelete) {
          const { error: delErr } = await supabase
            .from("coach_evaluation_clients" as never)
            .delete()
            .in("id" as never, existingClientIds as never);
          if (delErr) throw delErr;
        } else {
          const { error: unErr } = await supabase
            .from("coach_evaluation_clients" as never)
            .update({ student_id: null } as never)
            .in("id" as never, existingClientIds as never);
          if (unErr) throw unErr;
        }
      }

      // Vincula o cliente ao aluno
      const { error: upErr } = await supabase
        .from("coach_evaluation_clients" as never)
        .update({ student_id: student.id } as never)
        .eq("id" as never, client.id as never);
      if (upErr) throw upErr;
      const { error: aErr } = await supabase
        .from("coach_body_assessments" as never)
        .update({ student_id: student.id } as never)
        .eq("client_id" as never, client.id as never);
      if (aErr) throw aErr;

      // Registra auditoria
      const { data: sess } = await supabase.auth.getUser();
      await supabase.from("evaluation_link_audit" as never).insert({
        coach_id: targetCoachId,
        client_id: client.id,
        previous_student_id: previousStudentId,
        new_student_id: student.id,
        action: isTransfer ? "transfer" : (previousStudentId ? "transfer" : "link"),
        performed_by: sess.user?.id ?? null,
        performed_by_role: "coach",
        metadata: {
          client_name: client.name,
          student_name: student.name,
          transferred_from_client_ids: existingClientIds,
          duplicate_deleted: isTransfer && transferMergeAndDelete,
          merged_count: existingClientIds.length,
        },
      } as never);

      toast.success(
        isTransfer
          ? `Vínculo transferido e ${existingClientIds.length} cadastro(s) mesclado(s)`
          : "Avaliações integradas ao cadastro do aluno",
      );
      setConfirmLink(null);
      setLinkingClient(null);
      clientSummaryCache.delete(coachInfo.id);
      await loadClients();
    } catch (e: any) {
      console.error("[LinkExecute] erro:", e);
      toast.error(e?.message || "Erro ao integrar cadastro");
    } finally {
      setConfirmBusy(false);
    }
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
              Aluno: <b>{challengeLink.studentName}</b>. Selecione esse aluno na lista do FitMind Diagnóstico 360 e finalize a avaliação — peso, % gordura e link compartilhável serão salvos automaticamente no desafio.
            </p>
          </div>
          <button onClick={() => setChallengeLink(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">Avaliar Aluno</h1>
            {isMaster && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/40">
                Master Coach · acesso a todos os alunos
              </span>
            )}
          </div>
          <p className="text-sm text-foreground/50">
            {isMaster
              ? "Você pode avaliar alunos de qualquer coach da rede. O coach titular aparece no card do aluno."
              : "Registre bioimpedância, anamnese e evolução"}
          </p>
        </div>
        {coachInfo.id && <FineshapeImport coachId={coachInfo.id} onDone={() => { clientSummaryCache.delete(coachInfo.id); loadClients(); }} />}
      </div>

      {challengeCandidates.length > 0 && (
        <div className="mb-5 rounded-2xl border border-primary/30 bg-primary/5">
          <button
            type="button"
            onClick={() => setChallengeBannerOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left"
          >
            <Trophy className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground flex-1">Alunos com Desafio ativo aguardando avaliação</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">{challengeCandidates.length}</span>
            <span className={`text-primary text-xs transition-transform ${challengeBannerOpen ? "rotate-180" : ""}`}>▼</span>
          </button>
          {challengeBannerOpen && (
            <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {challengeCandidates.map((c) => {
                const isFinal = c.type === "final";
                const tone = isFinal
                  ? "bg-yellow-500/10 border-yellow-400/40"
                  : "bg-red-500/10 border-red-400/40";
                const btnTone = isFinal
                  ? "bg-yellow-400 text-black hover:bg-yellow-300"
                  : "bg-red-500 text-foreground hover:bg-red-400";
                const labelTone = isFinal ? "text-yellow-200" : "text-red-200";
                const finalDate = c.finalWeighInDate
                  ? new Date(c.finalWeighInDate + "T00:00:00").toLocaleDateString("pt-BR")
                  : null;
                return (
                  <div key={`${c.enrollmentId}-${c.type}`} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${tone}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{c.studentName}</p>
                      <p className={`text-[11px] truncate ${labelTone}`}>
                        {c.compLabel} · Turma {c.groupNumber} · Pesagem {isFinal ? "Final" : "Inicial"}
                        {isFinal && finalDate ? ` em ${finalDate}` : ""}
                        {c.coachName ? ` · Coach: ${c.coachName}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => linkChallengeCandidate({
                        enrollmentId: c.enrollmentId, type: c.type, studentId: c.studentId,
                        studentName: c.studentName, compLabel: c.compLabel,
                      })}
                      className={`shrink-0 text-xs font-bold px-3 py-2 rounded-lg ${btnTone}`}
                    >
                      Avaliar {isFinal ? "Final" : "Inicial"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}


      <FitMindShape
        coach={coachInfo}
        clients={clients}
        initialClientId={challengeLink?.preferredClientId}
        getChallengeCandidatesForClient={(client) =>
          challengeCandidates
            .filter((c) => {
              const freshClient = clients.find((item) => item.id === client.id);
              const studentId = client.studentId || freshClient?.studentId;
              return !!studentId && c.studentId === studentId;
            })
            .map((c) => ({
              enrollmentId: c.enrollmentId,
              type: c.type,
              studentId: c.studentId,
              studentName: c.studentName,
              compLabel: c.compLabel,
              groupNumber: c.groupNumber,
            }))
        }
        onLoadFullAssessments={loadFullAssessmentsForClient}
        onLinkClientToStudent={openLinkClientModal}
        onSync={async () => {
          if (coachInfo.id) clientSummaryCache.delete(coachInfo.id);
          await Promise.all([
            loadClients(),
            loadChallengeCandidates(coachInfo.id, isMaster),
          ]);
        }}
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
          clientSummaryCache.delete(coachInfo.id);
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
        onLoadFullClient={loadFullClient}
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
                ? { ...item, assessments: (client.assessments || []).filter((a) => a.id !== assessmentId) }
                : item,
            ),
          );
          toast.success("Avaliação excluída");
          clientSummaryCache.delete(coachInfo.id);
          fullAssessmentsCacheRef.current.delete(client.id);
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
            scale_number: nz(updated.scaleNumber)?.slice(0, 50),
            client_notes: nz(updated.clientNotes),
            professional_notes: nz(updated.professionalNotes),
            photos: updated.photos || {},
          };
          const shouldLinkChallenge = !!(updated.challengeEnrollmentId && updated.challengeType);
          // Vínculo com Desafio (opcional). O server function abaixo valida,
          // sincroniza a inscrição e mostra erro real caso falhe.
          if (updated.challengeEnrollmentId && updated.challengeType) {
            if ((client as any).studentId) payload.student_id = (client as any).studentId;
          } else if (updated.challengeEnrollmentId === undefined && updated.challengeType === undefined) {
            // Explicitamente desvinculado ("Não vincular")
            payload.challenge_enrollment_id = null;
            payload.challenge_type = null;
          }
          const { error } = await supabase
            .from("coach_body_assessments" as never)
            .update(payload as never)
            .eq("id" as never, updated.id as never)
            .eq("coach_id" as never, targetCoachId as never);
          if (error) { toast.error(error.message || "Erro ao atualizar avaliação"); throw error; }
          let linkedStudentId = (client as any).studentId as string | undefined;
          if (shouldLinkChallenge) {
            const linkResult = await linkAssessmentToChallengeFn({
              data: {
                assessmentId: updated.id,
                enrollmentId: updated.challengeEnrollmentId!,
                challengeType: updated.challengeType!,
              },
            });
            linkedStudentId = linkResult.studentId || linkedStudentId;
            await loadChallengeCandidates(coachInfo.id, isMaster);
          }
          toast.success(
            updated.challengeEnrollmentId
              ? `Avaliação atualizada e vinculada ao Desafio (${updated.challengeType === "initial" ? "Pesagem Inicial" : "Pesagem Final"})`
              : "Avaliação atualizada"
          );
          clientSummaryCache.delete(coachInfo.id);
          const updatedForState = {
            ...updated,
            clientId: client.id,
            challengeEnrollmentId: updated.challengeEnrollmentId,
            challengeType: updated.challengeType,
          };
          const updatedAssessments = (client.assessments || []).map((item) => (item.id === updated.id ? updatedForState : item));
          fullAssessmentsCacheRef.current.set(client.id, updatedAssessments);
          setClients((current) => current.map((item) => item.id === client.id ? { ...item, studentId: linkedStudentId || item.studentId, assessments: updatedAssessments } : item));
        }}
        onSearchClients={async (query) => clients.filter((client) => `${client.name} ${client.email}`.toLowerCase().includes(query.toLowerCase()))}
        onCreateGoogleCalendarEvent={async (date, time, clientName, eventName) => {
          // Google Calendar temporariamente desativado: grava em internal_appointments (agenda interna do coach)
          try {
            const startISO = new Date(`${date}T${time}:00`).toISOString();
            const endISO = new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();
            const client = clients.find((c) => c.name === clientName);
            const summary = (eventName && eventName.trim()) || `Avaliação — ${clientName}`;
            const studentId = (client as any)?.studentId ?? null;
            const { data: inserted, error } = await supabase
              .from("internal_appointments" as never)
              .insert({
                coach_id: coachInfo.id,
                summary,
                description: "Avaliação física agendada (agenda interna FitMind)",
                start_at: startISO,
                end_at: endISO,
                attendee_email: client?.email ?? null,
                attendee_name: clientName,
                student_id: studentId,
                source: "internal",
                status: "scheduled",
              } as never)
              .select("id" as never)
              .single();
            if (error) throw error;
            toast.success("Avaliação agendada na sua agenda interna");
            return { ok: true, htmlLink: (inserted as any)?.id ? `/coach?appointment=${(inserted as any).id}` : null };
          } catch (e: any) {
            console.error("internal appointment create error:", e);
            toast.error(e?.message || "Erro ao agendar avaliação");
            return { ok: false, error: e?.message || "Erro ao agendar" };
          }
        }}
        groups={[
          { id: "challenge", name: "Desafio 30 Dias", color: "var(--primary)" },
          { id: "premium", name: "Alunos Premium", color: "color-mix(in srgb, var(--primary) 70%, black)" },
        ]}
        themeColor="var(--primary)"
        themeFontFamily="inherit"
      />

      {linkingClient && (
        <div
          className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-foreground/50 p-4 overflow-y-auto overscroll-contain modal-safe"
          onClick={() => setLinkingClient(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-foreground/10 bg-zinc-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Integrar ao cadastro do sistema</h3>
                <p className="text-xs text-foreground/50 mt-0.5">
                  Vincular as avaliações de <b className="text-foreground/80">{linkingClient.name}</b> ao cadastro de um aluno.
                </p>
              </div>
              <button
                onClick={() => setLinkingClient(null)}
                className="text-foreground/60 hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <input
              type="text"
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder="Buscar aluno pelo nome ou e-mail..."
              className="w-full rounded-lg bg-foreground/50 border border-foreground/10 px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 mb-3 focus:outline-none focus:border-primary/60"
            />

            <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-foreground/10 divide-y divide-white/5">
              {linkLoading ? (
                <div className="p-6 text-center text-sm text-foreground/60">Carregando alunos...</div>
              ) : linkStudents.length === 0 ? (
                <div className="p-6 text-center text-sm text-foreground/60">Nenhum aluno encontrado</div>
              ) : (
                linkStudents
                  .filter((s) => {
                    const q = linkSearch.trim().toLowerCase();
                    if (!q) return true;
                    return `${s.name} ${s.email || ""}`.toLowerCase().includes(q);
                  })
                  .slice(0, 200)
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => requestLinkClientToStudent(linkingClient, s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-foreground/5 transition flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                        <p className="text-[11px] text-foreground/50 truncate">
                          Coach: {s.coachName || "—"}
                          {s.email ? ` · ${s.email}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-md bg-primary/20 text-primary border border-primary/40">
                        Vincular
                      </span>
                    </button>
                  ))
              )}
            </div>

            <p className="text-[11px] text-foreground/40 mt-3">
              Após integrar, todas as avaliações passam a aparecer para o aluno no perfil dele e nos históricos do coach.
            </p>
          </div>
        </div>
      )}

      {confirmLink && (
        <div
          className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center bg-foreground/50 p-4 overflow-y-auto overscroll-contain modal-safe"
          onClick={() => !confirmBusy && setConfirmLink(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-red-500/40 bg-zinc-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-foreground mb-2">
              Confirmar vinculação irreversível
            </h3>
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100 mb-3">
              <p className="font-semibold mb-1">⚠️ Esta ação é IRREVERSÍVEL pelo coach.</p>
              <p>
                As avaliações de <b>{confirmLink.client.name}</b> serão vinculadas
                permanentemente ao aluno <b>{confirmLink.student.name}</b>
                {confirmLink.student.email ? ` (${confirmLink.student.email})` : ""}.
                Apenas o administrador poderá desfazer.
              </p>
            </div>

            {confirmLink.existingClientName && (
              <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs text-yellow-100 mb-3 space-y-2">
                <p className="font-semibold">⚠️ Este aluno já está vinculado a outro cadastro</p>
                <p>
                  Cadastro atual: <b>"{confirmLink.existingClientName}"</b>.
                  Ao confirmar, todas as avaliações do cadastro atual serão
                  <b> movidas para "{confirmLink.client.name}"</b> e o vínculo
                  passará para este cadastro.
                </p>
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transferMergeAndDelete}
                    onChange={(e) => setTransferMergeAndDelete(e.target.checked)}
                    disabled={confirmBusy}
                    className="h-4 w-4"
                  />
                  <span>Excluir o cadastro duplicado <b>"{confirmLink.existingClientName}"</b> após transferir (recomendado)</span>
                </label>
              </div>
            )}

            <label className="block text-xs text-foreground/70 mb-1.5">
              Digite <b className="text-foreground">CONFIRMAR</b> para prosseguir:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRMAR"
              className="w-full rounded-lg bg-foreground/50 border border-foreground/10 px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 mb-3 focus:outline-none focus:border-red-500/60"
              disabled={confirmBusy}
              autoFocus
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmLink(null)}
                disabled={confirmBusy}
                className="px-3 py-2 text-sm text-foreground/70 hover:text-foreground disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={executeConfirmedLink}
                disabled={confirmBusy || confirmText.trim().toUpperCase() !== "CONFIRMAR"}
                className="px-4 py-2 text-sm font-bold rounded-lg bg-red-600 hover:bg-red-500 text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {confirmBusy
                  ? (confirmLink.existingClientName ? "Transferindo..." : "Vinculando...")
                  : (confirmLink.existingClientName ? "Transferir vínculo" : "Vincular permanentemente")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>

  );
}

export default EvaluateTab;
