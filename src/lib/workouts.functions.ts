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
      const parseInt0 = (s?: string | null) => {
        if (!s) return null;
        const n = parseInt(String(s).replace(/[^\d]/g, ""), 10);
        return Number.isFinite(n) ? n : null;
      };
      const rows = items.map((it, i) => ({
        plan_id: planId!,
        order_index: i,
        exercise_name: it.name,
        sets: parseInt0(it.sets) ?? 3,
        reps: it.reps ?? null,
        load_kg: null,
        rest_seconds: parseInt0(it.rest) ?? 60,
        equipment_config: null,
        media_url: null,
        notes: it.notes ?? null,
        is_cardio: false,
        cardio_duration_min: null,
        cardio_pace: null,
        cardio_speed: null,
        cardio_elevation: null,
      }));
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
    });
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

    // Achievements
    const { count: totalSessions } = await supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", userId)
      .not("ended_at", "is", null);

    const milestones: Array<{ count: number; code: string; title: string; icon: string }> = [
      { count: 1, code: "first_workout", title: "Primeiro Treino", icon: "🎯" },
      { count: 7, code: "7_workouts", title: "7 Treinos", icon: "🔥" },
      { count: 30, code: "30_workouts", title: "30 Treinos", icon: "💪" },
      { count: 100, code: "100_workouts", title: "100 Treinos", icon: "👑" },
    ];
    const earned: string[] = [];
    for (const m of milestones) {
      if ((totalSessions || 0) >= m.count) {
        const { error: aErr } = await supabase
          .from("workout_achievements")
          .upsert(
            { student_id: userId, code: m.code, title: m.title, icon: m.icon },
            { onConflict: "student_id,code", ignoreDuplicates: true },
          );
        if (!aErr) earned.push(m.title);
      }
    }
    return { xp, totalSessions: totalSessions || 0, newAchievements: earned };
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
