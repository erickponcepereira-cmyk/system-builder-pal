import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const linkFitmindAssessmentToChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assessmentId: string; enrollmentId: string; challengeType: "initial" | "final" }) =>
    z
      .object({
        assessmentId: z.string().uuid(),
        enrollmentId: z.string().uuid(),
        challengeType: z.enum(["initial", "final"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.id) throw new Error("Perfil não encontrado.");

    const { data: callerCoach } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    const callerCoachId = (callerCoach as { id?: string } | null)?.id ?? null;
    const isAdmin = (profile as { role?: string }).role === "admin";
    const { data: masterResult } = callerCoachId
      ? await supabaseAdmin.rpc("is_master_coach" as never, { _coach_id: callerCoachId } as never)
      : { data: false };
    const isMaster = !!masterResult;

    if (!isAdmin && !callerCoachId) throw new Error("Coach não encontrado.");

    const { data: assessmentRow, error: assessmentError } = await supabaseAdmin
      .from("coach_body_assessments" as never)
      .select("id, client_id, coach_id, student_id, weight, body_fat, muscle_mass, skeletal_muscle" as never)
      .eq("id" as never, data.assessmentId as never)
      .maybeSingle();
    if (assessmentError) throw new Error(assessmentError.message);
    const assessment = assessmentRow as {
      id: string;
      client_id: string;
      coach_id: string;
      student_id: string | null;
      weight: number | null;
      body_fat: number | null;
      muscle_mass: number | null;
      skeletal_muscle: number | null;
    } | null;
    if (!assessment) throw new Error("Avaliação não encontrada.");

    const { data: clientRow } = await supabaseAdmin
      .from("coach_evaluation_clients" as never)
      .select("id, name, student_id" as never)
      .eq("id" as never, assessment.client_id as never)
      .maybeSingle();
    const client = clientRow as { id: string; name: string | null; student_id: string | null } | null;

    const { data: enrollmentRow, error: enrollmentError } = await supabaseAdmin
      .from("competition_enrollments" as never)
      .select("id, student_id, coach_id, status, initial_weight, final_weight" as never)
      .eq("id" as never, data.enrollmentId as never)
      .maybeSingle();
    if (enrollmentError) throw new Error(enrollmentError.message);
    const enrollment = enrollmentRow as {
      id: string;
      student_id: string;
      coach_id: string;
      status: string;
      initial_weight: number | null;
      final_weight: number | null;
    } | null;
    if (!enrollment) throw new Error("Inscrição do desafio não encontrada.");

    const ownsAssessment = !!callerCoachId && assessment.coach_id === callerCoachId;
    const ownsEnrollment = !!callerCoachId && enrollment.coach_id === callerCoachId;
    if (!isAdmin && !isMaster && (!ownsAssessment || !ownsEnrollment)) {
      throw new Error("Você não tem permissão para vincular esta avaliação a este desafio.");
    }

    const existingStudentId = assessment.student_id || client?.student_id || null;
    if (existingStudentId && existingStudentId !== enrollment.student_id) {
      throw new Error("Esta avaliação está vinculada a outro aluno. Integre o cadastro correto antes de vincular ao desafio.");
    }
    if (data.challengeType === "final" && enrollment.initial_weight == null) {
      throw new Error("A pesagem final só pode ser vinculada depois da pesagem inicial.");
    }

    const { data: shareRows, error: shareLookupError } = await supabaseAdmin
      .from("assessment_shares" as never)
      .select("token" as never)
      .eq("assessment_id" as never, assessment.id as never)
      .order("created_at" as never, { ascending: false })
      .limit(1);
    if (shareLookupError) throw new Error(shareLookupError.message);

    let token = ((shareRows as Array<{ token: string }> | null) || [])[0]?.token;
    if (!token) {
      const { data: createdShare, error: shareCreateError } = await supabaseAdmin
        .from("assessment_shares" as never)
        .insert({
          assessment_id: assessment.id,
          coach_id: assessment.coach_id,
          client_name: (client?.name || "Aluno").slice(0, 120),
        } as never)
        .select("token" as never)
        .single();
      if (shareCreateError) throw new Error(shareCreateError.message);
      token = (createdShare as { token: string }).token;
    }

    const { error: clientUpdateError } = await supabaseAdmin
      .from("coach_evaluation_clients" as never)
      .update({ student_id: enrollment.student_id } as never)
      .eq("id" as never, assessment.client_id as never);
    if (clientUpdateError) throw new Error(clientUpdateError.message);

    const { error: assessmentUpdateError } = await supabaseAdmin
      .from("coach_body_assessments" as never)
      .update({
        student_id: enrollment.student_id,
        challenge_enrollment_id: enrollment.id,
        challenge_type: data.challengeType,
      } as never)
      .eq("id" as never, assessment.id as never);
    if (assessmentUpdateError) throw new Error(assessmentUpdateError.message);

    const shareUrl = `/resultado/${token}`;
    const muscleValue = assessment.skeletal_muscle ?? assessment.muscle_mass ?? null;
    const enrollmentPayload = data.challengeType === "initial"
      ? {
          initial_weight: assessment.weight,
          initial_body_fat: assessment.body_fat,
          initial_muscle_mass: muscleValue,
          initial_share_url: shareUrl,
          status: ["enrolled", "scheduled_initial"].includes(enrollment.status) ? "weighed_initial" : enrollment.status,
        }
      : {
          final_weight: assessment.weight,
          final_body_fat: assessment.body_fat,
          final_muscle_mass: muscleValue,
          final_share_url: shareUrl,
          status: "weighed_final",
        };

    const { data: updatedEnrollment, error: enrollmentUpdateError } = await supabaseAdmin
      .from("competition_enrollments" as never)
      .update(enrollmentPayload as never)
      .eq("id" as never, enrollment.id as never)
      .select("id, status, initial_weight, final_weight, initial_body_fat, final_body_fat, initial_muscle_mass, final_muscle_mass" as never)
      .maybeSingle();
    if (enrollmentUpdateError) throw new Error(enrollmentUpdateError.message);

    await supabaseAdmin
      .from("competition_appointments" as never)
      .update({ status: "completed", weight_recorded: assessment.weight, updated_at: new Date().toISOString() } as never)
      .eq("enrollment_id" as never, enrollment.id as never)
      .eq("type" as never, data.challengeType as never)
      .in("status" as never, ["pending", "confirmed"] as never);

    return {
      ok: true,
      shareUrl,
      assessmentId: assessment.id,
      studentId: enrollment.student_id,
      enrollment: updatedEnrollment as Record<string, unknown> | null,
    };
  });