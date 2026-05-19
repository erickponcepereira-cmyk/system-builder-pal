import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StudentHealthData = {
  studentId: string;
  currentWeight: number | null;
  goalWeight: number | null;
  dailyCaloriesGoal: number | null;
  activityFactor: number;
  bmr: number | null;
  // Suggested daily calories computed from latest FitMindShape assessment
  suggestedDailyCalories: number | null;
  lastAssessmentDate: string | null;
  lastAssessmentSource: "fitmindshape" | "students_table" | null;
};

const DEFAULT_ACTIVITY = 1.4;

async function resolveStudentForUser(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,email,phone")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.id) throw new Error("Perfil não encontrado");
  const { data: student } = await supabaseAdmin
    .from("students")
    .select(
      "id,coach_id,current_weight,goal_weight,bmr,daily_calories_goal,activity_factor",
    )
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!student?.id) throw new Error("Aluno não encontrado");
  return { profile, student };
}

export const getStudentHealthData = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentHealthData> => {
    const { profile, student } = await resolveStudentForUser(context.userId);

    // Try to find latest FitMindShape assessment for this student via email/phone match
    // within their coach's evaluation clients.
    let assessmentBmr: number | null = null;
    let assessmentWeight: number | null = null;
    let lastAssessmentDate: string | null = null;
    let source: StudentHealthData["lastAssessmentSource"] = null;

    if (student.coach_id && (profile.email || profile.phone)) {
      const filters: string[] = [];
      if (profile.email) filters.push(`email.eq.${profile.email}`);
      if (profile.phone) filters.push(`whatsapp.eq.${profile.phone}`);
      const orExpr = filters.join(",");
      const { data: client } = await supabaseAdmin
        .from("coach_evaluation_clients")
        .select("id")
        .eq("coach_id", student.coach_id)
        .or(orExpr)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (client?.id) {
        const { data: assessment } = await supabaseAdmin
          .from("coach_body_assessments")
          .select("basal_metabolism,weight,assessment_date")
          .eq("client_id", client.id)
          .order("assessment_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (assessment) {
          assessmentBmr = assessment.basal_metabolism ? Number(assessment.basal_metabolism) : null;
          assessmentWeight = assessment.weight ? Number(assessment.weight) : null;
          lastAssessmentDate = assessment.assessment_date || null;
          source = "fitmindshape";
        }
      }
    }

    const bmr = assessmentBmr ?? (student.bmr ? Number(student.bmr) : null);
    if (bmr && !source) source = "students_table";

    const activityFactor = student.activity_factor
      ? Number(student.activity_factor)
      : DEFAULT_ACTIVITY;

    const suggestedDailyCalories = bmr ? Math.round(bmr * activityFactor) : null;

    return {
      studentId: student.id,
      currentWeight: assessmentWeight ?? (student.current_weight ? Number(student.current_weight) : null),
      goalWeight: student.goal_weight ? Number(student.goal_weight) : null,
      dailyCaloriesGoal: student.daily_calories_goal ? Number(student.daily_calories_goal) : null,
      activityFactor,
      bmr,
      suggestedDailyCalories,
      lastAssessmentDate,
      lastAssessmentSource: source,
    };
  });

export type SaveStudentHealthGoalsInput = {
  goalWeight?: number | null;
  dailyCaloriesGoal?: number | null;
  activityFactor?: number | null;
};

export const saveStudentHealthGoals = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as SaveStudentHealthGoalsInput)
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { student } = await resolveStudentForUser(context.userId);
    const updates: Record<string, unknown> = {};
    if (data.goalWeight !== undefined) updates.goal_weight = data.goalWeight;
    if (data.dailyCaloriesGoal !== undefined) updates.daily_calories_goal = data.dailyCaloriesGoal;
    if (data.activityFactor !== undefined) {
      const af = Number(data.activityFactor);
      if (af && af >= 1 && af <= 3) updates.activity_factor = af;
    }
    if (!Object.keys(updates).length) return { ok: true };
    const { error } = await supabaseAdmin
      .from("students")
      .update(updates as never)
      .eq("id", student.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
