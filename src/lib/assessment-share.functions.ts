/**
 * Server functions for creating and reading shareable assessment links.
 *
 * - createAssessmentShare / deleteAssessmentShare: coach-only (requireSupabaseAuth)
 * - getAssessmentShareByToken: PUBLIC (no auth) — used by /resultado/$token
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PublicShareHistoryItem {
  id: string;
  date: string;
  weight: number | null;
  bodyFat: number | null;
  skeletalMuscle: number | null;
  muscleMass: number | null;
  visceralFat: number | null;
  bodyAge: number | null;
  bmi: number | null;
}

export interface PublicShareData {
  token: string;
  clientName: string;
  clientPhone: string | null;
  clientGender: "male" | "female" | "other";
  createdAt: string;
  viewCount: number;
  method: string;
  assessmentId: string;
  assessmentDate: string;
  age: number | null;
  height: number | null;
  weight: number | null;
  bmi: number | null;
  bodyFat: number | null;
  skeletalMuscle: number | null;
  muscleMass: number | null;
  visceralFat: number | null;
  basalMetabolism: number | null;
  bodyAge: number | null;
  bodyWater: number | null;
  boneMass: number | null;
  segmentAnalysis: Record<string, any> | null;
  systolicBP: number | null;
  diastolicBP: number | null;
  heartRate: number | null;
  bloodGlucose: number | null;
  photos: Record<string, string | undefined> | null;
  circumferences: Record<string, number | undefined> | null;
  clientNotes: string | null;
  history: PublicShareHistoryItem[];
  coachName: string;
  coachSpecialty: string | null;
  coachAvatar: string | null;
  coachEmail: string | null;
  coachWhatsapp: string | null;
  coachInstagram: string | null;
  coachReferralCode: string | null;
}


const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function getCallerCoachId(userId: string): Promise<string> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.id) throw new Error("Perfil não encontrado");
  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!coach?.id) throw new Error("Coach não encontrado");
  return coach.id as string;
}

// ── Create a share link ──────────────────────────────────────────────────────

export const createAssessmentShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assessmentId: string; clientName: string }) =>
    z
      .object({
        assessmentId: z.string().uuid(),
        clientName: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const coachId = await getCallerCoachId(context.userId);

    // Ensure the assessment belongs to this coach
    const { data: assessment } = await supabaseAdmin
      .from("coach_body_assessments" as never)
      .select("id,coach_id" as never)
      .eq("id" as never, data.assessmentId as never)
      .maybeSingle();
    const a = assessment as { id: string; coach_id: string } | null;
    if (!a || a.coach_id !== coachId) {
      throw new Error("Avaliação não encontrada");
    }

    // Reuse existing share if any
    const { data: existing } = await supabaseAdmin
      .from("assessment_shares" as never)
      .select("token" as never)
      .eq("assessment_id" as never, data.assessmentId as never)
      .eq("coach_id" as never, coachId as never)
      .maybeSingle();
    if (existing) return { token: (existing as { token: string }).token };

    const { data: share, error: insertErr } = await supabaseAdmin
      .from("assessment_shares" as never)
      .insert({
        assessment_id: data.assessmentId,
        coach_id: coachId,
        client_name: data.clientName.trim().slice(0, 120),
      } as never)
      .select("token" as never)
      .single();

    if (insertErr) throw new Error(insertErr.message);
    return { token: (share as { token: string }).token };
  });

// ── Fetch a share by token (PUBLIC, no auth required) ────────────────────────

export const getAssessmentShareByToken = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().min(8).max(64).regex(/^[a-zA-Z0-9_-]+$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: shareRow, error: shareErr } = await supabaseAdmin
      .from("assessment_shares" as never)
      .select("id,token,assessment_id,coach_id,client_name,created_at,view_count,expires_at" as never)
      .eq("token" as never, data.token as never)
      .maybeSingle();

    if (shareErr || !shareRow) throw new Error("Link não encontrado ou expirado");
    const s = shareRow as {
      token: string;
      assessment_id: string;
      coach_id: string;
      client_name: string;
      created_at: string;
      view_count: number;
      expires_at: string | null;
    };

    if (s.expires_at && new Date(s.expires_at).getTime() < Date.now()) {
      throw new Error("Link expirado");
    }

    // Fire-and-forget view counter
    supabaseAdmin
      .rpc("increment_share_view" as never, { p_token: data.token } as never)
      .then(() => undefined, () => undefined);

    const { data: assessment, error: aErr } = await supabaseAdmin
      .from("coach_body_assessments" as never)
      .select("*" as never)
      .eq("id" as never, s.assessment_id as never)
      .maybeSingle();
    if (aErr || !assessment) throw new Error("Avaliação não encontrada");
    const a = assessment as Record<string, unknown>;

    // Lookup client (phone, gender) from coach_evaluation_clients
    const clientId = a.client_id as string | undefined;
    let clientPhone: string | null = null;
    let clientGender: "male" | "female" | "other" = "other";
    if (clientId) {
      const { data: clientRow } = await supabaseAdmin
        .from("coach_evaluation_clients")
        .select("whatsapp,gender")
        .eq("id", clientId)
        .maybeSingle();
      clientPhone = (clientRow?.whatsapp as string | null) ?? null;
      const g = (clientRow?.gender as string | null) ?? "other";
      clientGender = g === "male" || g === "female" ? g : "other";
    }

    // History: all assessments for the same client
    let history: PublicShareHistoryItem[] = [];
    if (clientId) {
      const { data: histRows } = await supabaseAdmin
        .from("coach_body_assessments" as never)
        .select(
          "id,assessment_date,weight,body_fat,skeletal_muscle,muscle_mass,visceral_fat,body_age,bmi" as never,
        )
        .eq("client_id" as never, clientId as never)
        .order("assessment_date" as never, { ascending: true } as never)
        .limit(50);
      const rows = (histRows ?? []) as Array<Record<string, unknown>>;
      history = rows.map((r) => ({
        id: r.id as string,
        date: r.assessment_date as string,
        weight: num(r.weight),
        bodyFat: num(r.body_fat),
        skeletalMuscle: num(r.skeletal_muscle),
        muscleMass: num(r.muscle_mass),
        visceralFat: num(r.visceral_fat),
        bodyAge: (r.body_age as number | null) ?? null,
        bmi: num(r.bmi),
      }));
    }

    const { data: coachRow } = await supabaseAdmin
      .from("coaches")
      .select(
        "id,profile_id,referral_code,instagram,specialty_key,specialty_custom_description",
      )
      .eq("id", s.coach_id)
      .maybeSingle();
    const c = (coachRow ?? null) as
      | {
          id: string;
          profile_id: string;
          referral_code: string | null;
          instagram: string | null;
          specialty_key: string | null;
          specialty_custom_description: string | null;
        }
      | null;

    const { data: coachProfile } = c?.profile_id
      ? await supabaseAdmin
          .from("profiles")
          .select("name,avatar_url,photo_url,email,phone,instagram,bio,profession")
          .eq("id", c.profile_id)
          .maybeSingle()
      : {
          data: null as {
            name: string | null;
            avatar_url: string | null;
            photo_url: string | null;
            email: string | null;
            phone: string | null;
            instagram: string | null;
            bio: string | null;
            profession: string | null;
          } | null,
        };

    // Resolve specialty label from professional_specialties when available
    let specialtyLabel: string | null = null;
    if (c?.specialty_key) {
      const { data: spec } = await supabaseAdmin
        .from("professional_specialties")
        .select("label")
        .eq("key", c.specialty_key)
        .maybeSingle();
      specialtyLabel = (spec?.label as string | null) ?? null;
    }


    const photosRaw = (a.photos as Record<string, string | undefined> | null) ?? null;
    const photos = photosRaw && Object.keys(photosRaw).length > 0 ? photosRaw : null;
    // circumferences live inside segment_analysis or separate? Check schema — it's not a column; coaches store via assessment payload. Fallback: read from segment_analysis.circumferences if present.
    const segAny = (a.segment_analysis as Record<string, any> | null) ?? null;
    const circumferences =
      (segAny && (segAny.circumferences as Record<string, number> | null)) || null;

    const result: PublicShareData = {
      token: s.token,
      clientName: s.client_name,
      clientPhone,
      clientGender,
      createdAt: s.created_at,
      viewCount: s.view_count + 1,
      method: (a.method as string) || "bioimpedance",
      assessmentId: a.id as string,
      assessmentDate: a.assessment_date as string,
      age: (a.age as number | null) ?? null,
      height: num(a.height),
      weight: num(a.weight),
      bmi: num(a.bmi),
      bodyFat: num(a.body_fat),
      skeletalMuscle: num(a.skeletal_muscle),
      muscleMass: num(a.muscle_mass),
      visceralFat: num(a.visceral_fat),
      basalMetabolism: num(a.basal_metabolism),
      bodyAge: (a.body_age as number | null) ?? null,
      bodyWater: num(a.body_water),
      boneMass: num(a.bone_mass),
      segmentAnalysis: segAny,
      systolicBP: (a.systolic_bp as number | null) ?? null,
      diastolicBP: (a.diastolic_bp as number | null) ?? null,
      heartRate: (a.heart_rate as number | null) ?? null,
      bloodGlucose: num(a.blood_glucose),
      photos,
      circumferences,
      clientNotes: (a.client_notes as string | null) ?? null,
      history,
      coachName: coachProfile?.name || "Coach FitMind",
      coachSpecialty:
        specialtyLabel ||
        c?.specialty_custom_description ||
        coachProfile?.profession ||
        coachProfile?.bio ||
        "Especialista em Saúde e Bem-estar",
      coachAvatar: coachProfile?.avatar_url || coachProfile?.photo_url || null,
      coachEmail: (coachProfile?.email as string | null) ?? null,
      coachWhatsapp: coachProfile?.phone ?? null,
      coachInstagram: c?.instagram || coachProfile?.instagram || null,
      coachReferralCode: c?.referral_code ?? null,

    };

    return result;

  });

// ── Delete a share (coach only) ──────────────────────────────────────────────

export const deleteAssessmentShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().min(8).max(64) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const coachId = await getCallerCoachId(context.userId);
    const { error } = await supabaseAdmin
      .from("assessment_shares" as never)
      .delete()
      .eq("token" as never, data.token as never)
      .eq("coach_id" as never, coachId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
