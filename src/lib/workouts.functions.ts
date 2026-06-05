import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Parse a freeform rest string ("60s", "1min", "35 a 45 segundos", "35-45", "1:30")
 * into { min, max } seconds. Falls back to 60s when unparseable.
 *
 * IMPORTANT: previously we did `parseInt(s.replace(/[^\d]/g, ""))` which turned
 * "35 a 45 segundos" into 3545 → ~59min countdown. This new parser keeps the
 * tokens separated and infers the time unit.
 */
export function parseRestRange(input?: string | null): { min: number; max: number } {
  if (input == null) return { min: 60, max: 60 };
  const raw = String(input).trim().toLowerCase();
  if (!raw) return { min: 60, max: 60 };
  const mmss = raw.match(/^(\d+)\s*:\s*(\d+)$/);
  if (mmss) {
    const v = parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
    return { min: v, max: v };
  }
  const isMinutes = /\bmin|\bm\b|minuto/.test(raw);
  const factor = isMinutes && !/seg|\bs\b/.test(raw) ? 60 : 1;
  const nums = raw.match(/\d+/g)?.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n)) || [];
  if (nums.length === 0) return { min: 60, max: 60 };
  if (nums.length === 1) {
    const v = nums[0] * factor;
    return { min: v, max: v };
  }
  const a = nums[0] * factor;
  const b = nums[1] * factor;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

const exerciseSchema = z.object({
  id: z.string().uuid().optional(),
  order_index: z.number().int().nonnegative(),
  exercise_name: z.string().min(1).max(200),
  exercise_ref_id: z.string().uuid().nullable().optional(),
  sets: z.number().int().min(1).max(20),
  reps: z.string().max(50).nullable().optional(),
  load_kg: z.number().nullable().optional(),
  rest_seconds: z.number().int().min(0).max(3600),
  rest_seconds_max: z.number().int().min(0).max(3600).nullable().optional(),
  equipment_config: z.string().max(500).nullable().optional(),
  media_url: z.string().max(1000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  is_cardio: z.boolean(),
  cardio_duration_min: z.number().nullable().optional(),
  cardio_pace: z.string().max(50).nullable().optional(),
  cardio_speed: z.number().nullable().optional(),
  cardio_elevation: z.number().nullable().optional(),
});

const savePlanSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  student_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  exercises: z.array(exerciseSchema).max(60),
});

export const listWorkoutPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { studentId?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const studentId = data.studentId || userId;
    const { data: plans, error } = await supabase
      .from("workout_plans")
      .select("*, workout_exercises(*)")
      .eq("student_id", studentId)
      .eq("active", true)
      .order("day_of_week", { ascending: true });
    if (error) throw new Error(error.message);
    return plans || [];
  });

export const saveWorkoutPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => savePlanSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const coachId = data.student_id === userId ? null : userId;
    let planId = data.id;
    if (planId) {
      const { error } = await supabase
        .from("workout_plans")
        .update({ name: data.name, day_of_week: data.day_of_week ?? null, notes: data.notes ?? null })
        .eq("id", planId);
      if (error) throw new Error(error.message);
      await supabase.from("workout_exercises").delete().eq("plan_id", planId);
    } else {
      const { data: created, error } = await supabase
        .from("workout_plans")
        .insert({
          student_id: data.student_id,
          coach_id: coachId,
          name: data.name,
          day_of_week: data.day_of_week ?? null,
          notes: data.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      planId = created.id;
    }
    if (data.exercises.length > 0) {
      const rows = data.exercises.map((e, i) => ({
        plan_id: planId!,
        order_index: i,
        exercise_name: e.exercise_name,
        exercise_ref_id: e.exercise_ref_id ?? null,
        sets: e.sets,
        reps: e.reps ?? null,
        load_kg: e.load_kg ?? null,
        rest_seconds: e.rest_seconds,
        rest_seconds_max: e.rest_seconds_max ?? null,
        equipment_config: e.equipment_config ?? null,
        media_url: e.media_url ?? null,
        notes: e.notes ?? null,
        is_cardio: e.is_cardio,
        cardio_duration_min: e.cardio_duration_min ?? null,
        cardio_pace: e.cardio_pace ?? null,
        cardio_speed: e.cardio_speed ?? null,
        cardio_elevation: e.cardio_elevation ?? null,
      }));
      const { error } = await supabase.from("workout_exercises").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { id: planId };
  });

export const deleteWorkoutPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workout_plans").update({ active: false }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Syncs the simple "Treino prescrito" from the protocol screen into the
 * gamified workout_plans/workout_exercises pipeline so the student sees it
 * in "Meu Treino" (home gamification), not only inside the protocol.
 */
export const syncProtocolWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      student_record_id: z.string().uuid(),
      name: z.string().min(1).max(200),
      items: z.array(z.object({
        name: z.string().min(1).max(200),
        sets: z.string().max(50).optional().nullable(),
        reps: z.string().max(50).optional().nullable(),
        rest: z.string().max(50).optional().nullable(),
        notes: z.string().max(1000).optional().nullable(),
      })).max(60),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Resolve student's auth user_id from students.id
    const { data: stu, error: stuErr } = await supabase
      .from("students")
      .select("profile_id, profiles!students_profile_id_fkey(user_id)")
      .eq("id", data.student_record_id)
      .maybeSingle();
    if (stuErr) throw new Error(stuErr.message);
    const studentUserId = (stu as any)?.profiles?.user_id as string | null;
    if (!studentUserId) throw new Error("Aluno sem usuário vinculado");

    // Upsert single plan "Treino Prescrito" tied to this coach
    const { data: existing } = await supabase
      .from("workout_plans")
      .select("id")
      .eq("student_id", studentUserId)
      .eq("name", data.name)
      .eq("active", true)
      .maybeSingle();

    let planId = (existing as any)?.id as string | undefined;
    if (planId) {
      await supabase.from("workout_exercises").delete().eq("plan_id", planId);
    } else {
      const { data: created, error } = await supabase
        .from("workout_plans")
        .insert({
          student_id: studentUserId,
          coach_id: userId,
          name: data.name,
          day_of_week: null,
          notes: "Importado do protocolo",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      planId = created.id;
    }

    const items = data.items.filter((i) => i.name.trim());
    if (items.length > 0 && planId) {
      const parseIntSafe = (s?: string | null) => {
        if (!s) return null;
        const m = String(s).match(/\d+/);
        return m ? parseInt(m[0], 10) : null;
      };
      const rows = items.map((it, i) => {
        const rest = parseRestRange(it.rest);
        return {
          plan_id: planId!,
          order_index: i,
          exercise_name: it.name,
          sets: parseIntSafe(it.sets) ?? 3,
          reps: it.reps ?? null,
          load_kg: null,
          rest_seconds: rest.min,
          rest_seconds_max: rest.max,
          equipment_config: null,
          media_url: null,
          notes: it.notes ?? null,
          is_cardio: false,
          cardio_duration_min: null,
          cardio_pace: null,
          cardio_speed: null,
          cardio_elevation: null,
        };
      });
      const { error } = await supabase.from("workout_exercises").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true, plan_id: planId };
  });

export const startWorkoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ plan_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: created, error } = await supabase
      .from("workout_sessions")
      .insert({ plan_id: data.plan_id, student_id: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const logSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      exercise_id: z.string().uuid(),
      set_number: z.number().int().min(1).max(50),
      reps_done: z.number().int().nullable().optional(),
      load_kg: z.number().nullable().optional(),
      rest_seconds_actual: z.number().int().nullable().optional(),
      rest_exceeded: z.boolean(),
      equipment_config: z.string().max(500).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workout_session_logs").insert({
      session_id: data.session_id,
      exercise_id: data.exercise_id,
      set_number: data.set_number,
      reps_done: data.reps_done ?? null,
      load_kg: data.load_kg ?? null,
      rest_seconds_actual: data.rest_seconds_actual ?? null,
      rest_exceeded: data.rest_exceeded,
      equipment_config: data.equipment_config ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const logCardio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      exercise_id: z.string().uuid(),
      duration_min: z.number().nullable().optional(),
      distance_km: z.number().nullable().optional(),
      pace: z.string().max(50).nullable().optional(),
      speed: z.number().nullable().optional(),
      elevation: z.number().nullable().optional(),
      calories: z.number().int().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workout_cardio_logs").insert({
      session_id: data.session_id,
      exercise_id: data.exercise_id,
      duration_min: data.duration_min ?? null,
      distance_km: data.distance_km ?? null,
      pace: data.pace ?? null,
      speed: data.speed ?? null,
      elevation: data.elevation ?? null,
      calories: data.calories ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finishWorkoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      total_seconds: z.number().int().min(0),
      completion_pct: z.number().min(0).max(100),
      notes: z.string().max(2000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const xp = Math.round(data.completion_pct * 10 + data.total_seconds / 60);
    const { error } = await supabase
      .from("workout_sessions")
      .update({
        ended_at: new Date().toISOString(),
        total_seconds: data.total_seconds,
        completion_pct: data.completion_pct,
        xp_earned: xp,
        notes: data.notes ?? null,
      })
      .eq("id", data.session_id);
    if (error) throw new Error(error.message);

    // Achievements driven by admin-managed catalog
    const { count: totalSessions } = await supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", userId)
      .not("ended_at", "is", null);

    // Compute current streak (consecutive days with at least one finished session)
    const { data: recent } = await supabase
      .from("workout_sessions")
      .select("started_at, ended_at")
      .eq("student_id", userId)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(180);
    const daySet = new Set<string>();
    (recent || []).forEach((s: any) => daySet.add(new Date(s.started_at).toISOString().slice(0, 10)));
    let streak = 0;
    {
      const d = new Date();
      for (;;) {
        const key = d.toISOString().slice(0, 10);
        if (daySet.has(key)) { streak++; d.setDate(d.getDate() - 1); } else break;
      }
    }

    // Personal challenges: mark any active ones as completed if streak reached target
    const { data: challenges } = await supabase
      .from("personal_challenges" as never)
      .select("id, target_days, status" as never)
      .eq("student_id" as never, userId as never)
      .eq("status" as never, "active" as never);
    let personalCompletedThisSession = false;
    for (const c of ((challenges as any[]) || [])) {
      if (streak >= c.target_days) {
        await supabase
          .from("personal_challenges" as never)
          .update({ status: "completed", completed_at: new Date().toISOString() } as never)
          .eq("id" as never, c.id as never);
        personalCompletedThisSession = true;
      }
    }

    const { data: catalog } = await supabase
      .from("achievement_catalog" as never)
      .select("code, title, description, icon, condition_type, condition_value" as never)
      .eq("active" as never, true as never);

    const earned: Array<{ code: string; title: string; icon: string | null }> = [];
    for (const a of ((catalog as any[]) || [])) {
      let satisfied = false;
      if (a.condition_type === "workouts_count") satisfied = (totalSessions || 0) >= (a.condition_value || 1);
      else if (a.condition_type === "streak_days") satisfied = streak >= (a.condition_value || 1);
      else if (a.condition_type === "personal_challenge_completed") satisfied = personalCompletedThisSession;
      if (!satisfied) continue;
      const { data: existing } = await supabase
        .from("workout_achievements")
        .select("id")
        .eq("student_id", userId)
        .eq("code", a.code)
        .maybeSingle();
      if (existing) continue;
      const { error: aErr } = await supabase
        .from("workout_achievements")
        .insert({ student_id: userId, code: a.code, title: a.title, description: a.description, icon: a.icon } as never);
      if (!aErr) earned.push({ code: a.code, title: a.title, icon: a.icon });
    }
    return { xp, totalSessions: totalSessions || 0, streak, newAchievements: earned };
  });

/* ---------------- Workout exercise inline edits ---------------- */

export const updatePlanExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      exercise_id: z.string().uuid(),
      exercise_name: z.string().min(1).max(200).optional(),
      sets: z.number().int().min(1).max(50).optional(),
      reps: z.string().max(50).nullable().optional(),
      rest_seconds: z.number().int().min(0).max(3600).optional(),
      rest_seconds_max: z.number().int().min(0).max(3600).nullable().optional(),
      notes: z.string().max(1000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: any = {};
    if (data.exercise_name !== undefined) patch.exercise_name = data.exercise_name;
    if (data.sets !== undefined) patch.sets = data.sets;
    if (data.reps !== undefined) patch.reps = data.reps;
    if (data.rest_seconds !== undefined) patch.rest_seconds = data.rest_seconds;
    if (data.rest_seconds_max !== undefined) patch.rest_seconds_max = data.rest_seconds_max;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await context.supabase.from("workout_exercises").update(patch as never).eq("id", data.exercise_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePlanExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ exercise_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workout_exercises").delete().eq("id", data.exercise_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replacePlanExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      exercise_id: z.string().uuid(),
      new_name: z.string().min(1).max(200),
      sets: z.number().int().min(1).max(50).optional(),
      reps: z.string().max(50).nullable().optional(),
      rest_seconds: z.number().int().min(0).max(3600).optional(),
      rest_seconds_max: z.number().int().min(0).max(3600).nullable().optional(),
      notes: z.string().max(1000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: any = { exercise_name: data.new_name };
    if (data.sets !== undefined) patch.sets = data.sets;
    if (data.reps !== undefined) patch.reps = data.reps;
    if (data.rest_seconds !== undefined) patch.rest_seconds = data.rest_seconds;
    if (data.rest_seconds_max !== undefined) patch.rest_seconds_max = data.rest_seconds_max;
    if (data.notes !== undefined) patch.notes = data.notes;
    // Reset learned data when replacing the exercise
    patch.load_kg = null;
    patch.equipment_config_user = null;
    const { error } = await context.supabase.from("workout_exercises").update(patch as never).eq("id", data.exercise_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addPlanExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      plan_id: z.string().uuid(),
      name: z.string().min(1).max(200),
      sets: z.number().int().min(1).max(50).default(3),
      reps: z.string().max(50).nullable().optional(),
      rest_seconds: z.number().int().min(0).max(3600).default(60),
      rest_seconds_max: z.number().int().min(0).max(3600).nullable().optional(),
      notes: z.string().max(1000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("workout_exercises")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", data.plan_id);
    const { error } = await context.supabase.from("workout_exercises").insert({
      plan_id: data.plan_id,
      order_index: count || 0,
      exercise_name: data.name,
      sets: data.sets,
      reps: data.reps ?? null,
      rest_seconds: data.rest_seconds,
      rest_seconds_max: data.rest_seconds_max ?? null,
      notes: data.notes ?? null,
      is_cardio: false,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Personal challenges ---------------- */

export const listPersonalChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("personal_challenges" as never)
      .select("*" as never)
      .eq("student_id" as never, userId as never)
      .order("created_at" as never, { ascending: false });
    return { challenges: (data as any[]) || [] };
  });

export const createPersonalChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      title: z.string().min(1).max(120),
      target_days: z.number().int().min(1).max(365),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("personal_challenges" as never)
      .insert({ student_id: userId, title: data.title, target_days: data.target_days } as never)
      .select("*" as never)
      .single();
    if (error) throw new Error(error.message);
    return { challenge: row };
  });

export const deletePersonalChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("personal_challenges" as never)
      .delete()
      .eq("id" as never, data.id as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const getWorkoutHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { studentId?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const studentId = data.studentId || userId;
    const { data: sessions } = await supabase
      .from("workout_sessions")
      .select("id, plan_id, started_at, ended_at, total_seconds, completion_pct, xp_earned, workout_plans!inner(name, student_id)")
      .eq("student_id", studentId)
      .order("started_at", { ascending: false })
      .limit(200);
    const { data: logs } = await supabase
      .from("workout_session_logs")
      .select("exercise_id, load_kg, completed_at, workout_exercises!inner(exercise_name)")
      .order("completed_at", { ascending: true });
    const { data: achievements } = await supabase
      .from("workout_achievements")
      .select("*")
      .eq("student_id", studentId)
      .order("earned_at", { ascending: false });
    return { sessions: sessions || [], logs: logs || [], achievements: achievements || [] };
  });

/**
 * Activate a workout_template directly for a given student, creating a
 * gamified workout_plan + workout_exercises so the coach can enable multiple
 * days (A, B, C, D, E) side by side without overwriting the protocol.
 */
export const enableTemplateForStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      student_record_id: z.string().uuid(),
      template_id: z.string().uuid(),
      letter: z.string().max(2).nullable().optional(),
      day_of_week: z.number().int().min(0).max(6).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: stu, error: stuErr } = await supabase
      .from("students")
      .select("profile_id, profiles!students_profile_id_fkey(user_id)")
      .eq("id", data.student_record_id)
      .maybeSingle();
    if (stuErr) throw new Error(stuErr.message);
    const studentUserId = (stu as any)?.profiles?.user_id as string | null;
    if (!studentUserId) throw new Error("Aluno sem usuário vinculado");

    const { data: tpl, error: tplErr } = await supabase
      .from("workout_templates" as never)
      .select("name, items" as never)
      .eq("id" as never, data.template_id as never)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl) throw new Error("Template não encontrado");

    const tplName = (tpl as any).name as string;
    const items = ((tpl as any).items || []) as Array<{ name: string; sets?: string; reps?: string; rest?: string; notes?: string }>;
    const planName = tplName;
    const letter = (data.letter || "").toUpperCase().slice(0, 2) || null;

    const { data: created, error } = await supabase
      .from("workout_plans")
      .insert({
        student_id: studentUserId,
        coach_id: userId,
        name: planName,
        day_of_week: data.day_of_week ?? null,
        letter,
        notes: `Importado do template "${tplName}"`,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const planId = created.id;

    const parseIntSafe = (s?: string | null) => {
      if (!s) return null;
      const m = String(s).match(/\d+/);
      return m ? parseInt(m[0], 10) : null;
    };
    const rows = items.filter((it) => it.name?.trim()).map((it, i) => {
      const rest = parseRestRange(it.rest);
      return {
        plan_id: planId,
        order_index: i,
        exercise_name: it.name,
        sets: parseIntSafe(it.sets) ?? 3,
        reps: it.reps ?? null,
        load_kg: null,
        rest_seconds: rest.min,
        rest_seconds_max: rest.max,
        equipment_config: null,
        media_url: null,
        notes: it.notes ?? null,
        is_cardio: false,
        cardio_duration_min: null,
        cardio_pace: null,
        cardio_speed: null,
        cardio_elevation: null,
      };
    });
    if (rows.length > 0) {
      const { error: exErr } = await supabase.from("workout_exercises").insert(rows as never);
      if (exErr) throw new Error(exErr.message);
    }
    return { ok: true, plan_id: planId, plan_name: planName };
  });

/**
 * Persist the student's equipment configuration (e.g. "Pino 4, banco 2")
 * on a specific exercise of their plan, so it pre-fills on next sessions.
 */
export const updateExerciseUserConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      exercise_id: z.string().uuid(),
      equipment_config_user: z.string().max(500).nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workout_exercises")
      .update({ equipment_config_user: data.equipment_config_user } as never)
      .eq("id", data.exercise_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Returns the most recent log per exercise for the current user, so the UI
 * can hint "última vez: 20kg · pino 4" before they start a new set.
 */
export const getLastExerciseLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ exercise_ids: z.array(z.string().uuid()).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.exercise_ids.length === 0) return { last: {} as Record<string, { load_kg: number | null; equipment_config: string | null; completed_at: string }> };
    const { data: logs } = await supabase
      .from("workout_session_logs")
      .select("exercise_id, load_kg, equipment_config, completed_at, workout_sessions!inner(student_id)" as never)
      .in("exercise_id", data.exercise_ids)
      .eq("workout_sessions.student_id" as never, userId as never)
      .order("completed_at", { ascending: false })
      .limit(500);
    const last: Record<string, { load_kg: number | null; equipment_config: string | null; completed_at: string }> = {};
    ((logs as any[]) || []).forEach((l) => {
      if (!last[l.exercise_id]) {
        last[l.exercise_id] = {
          load_kg: l.load_kg,
          equipment_config: l.equipment_config,
          completed_at: l.completed_at,
        };
      }
    });
    return { last };
  });

/**
 * Coach-facing: list active workout_plans (with exercises) for a given
 * student record id (students.id). Resolves the student's auth user_id then
 * fetches plans so the coach UI can show what's been enabled per day.
 */
export const listStudentWorkoutPlansByRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ student_record_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: stu, error: stuErr } = await supabase
      .from("students")
      .select("profile_id, profiles!students_profile_id_fkey(user_id)")
      .eq("id", data.student_record_id)
      .maybeSingle();
    if (stuErr) throw new Error(stuErr.message);
    const studentUserId = (stu as any)?.profiles?.user_id as string | null;
    if (!studentUserId) return { plans: [] };
    const { data: plans, error } = await supabase
      .from("workout_plans")
      .select("id, name, day_of_week, notes, letter, created_at, workout_exercises(id, order_index, exercise_name, sets, reps, rest_seconds, rest_seconds_max, notes)")
      .eq("student_id", studentUserId)
      .eq("active", true)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { plans: plans || [] };
  });

