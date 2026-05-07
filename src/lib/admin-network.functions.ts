import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export const changeStudentCoachAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ studentId: uuid, newCoachId: uuid }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile, notifyProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, profile_id, coach_id, coaches:coach_id(profile_id)")
      .eq("id", data.studentId)
      .maybeSingle();
    if (!student) throw new Error("Aluno não encontrado");

    const { data: newCoach } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id")
      .eq("id", data.newCoachId)
      .not("approved_at", "is", null)
      .is("blocked_at", null)
      .maybeSingle();
    if (!newCoach) throw new Error("Coach destino inválido ou indisponível");

    const { error } = await supabaseAdmin.from("students").update({ coach_id: data.newCoachId }).eq("id", data.studentId);
    if (error) throw new Error(error.message);

    const oldCoachProfileId = (student as any).coaches?.profile_id as string | undefined;
    await notifyProfile(newCoach.profile_id, "student_assigned", "Novo aluno na sua equipe", "Um aluno foi vinculado à sua equipe pelo administrador.", "/coach");
    if (oldCoachProfileId && oldCoachProfileId !== newCoach.profile_id) {
      await notifyProfile(oldCoachProfileId, "student_removed", "Aluno realocado", "Um aluno foi realocado para outro coach pelo administrador.", "/coach");
    }
    await notifyProfile(student.profile_id, "coach_changed", "Coach atualizado", "Seu coach foi alterado pelo administrador.", "/student");
    return { ok: true };
  });

export const blockCoachAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ coachId: uuid, reason: z.string().optional() }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile, notifyProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);
    const reason = data.reason || "Bloqueado manualmente pelo administrador.";
    const { data: coach } = await supabaseAdmin.from("coaches").select("profile_id").eq("id", data.coachId).maybeSingle();
    if (!coach) throw new Error("Coach não encontrado");
    const { error } = await supabaseAdmin.from("coaches").update({ inactive_since: new Date().toISOString().slice(0, 10), blocked_at: new Date().toISOString(), blocked_reason: reason }).eq("id", data.coachId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ status: "blocked" }).eq("id", coach.profile_id);
    await notifyProfile(coach.profile_id, "coach_blocked", "Conta de coach bloqueada", reason, "/coach");
    return { ok: true };
  });

export const unblockCoachAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ coachId: uuid }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile, notifyProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);
    const { data: coach } = await supabaseAdmin.from("coaches").select("profile_id").eq("id", data.coachId).maybeSingle();
    if (!coach) throw new Error("Coach não encontrado");
    const { error } = await supabaseAdmin.from("coaches").update({ blocked_at: null, blocked_reason: null, inactive_since: null, inactivity_grace_until: null, last_activity_at: new Date().toISOString() }).eq("id", data.coachId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ status: "active" }).eq("id", coach.profile_id);
    await notifyProfile(coach.profile_id, "coach_unblocked", "Conta reativada", "Sua conta de coach foi reativada pelo administrador.", "/coach");
    return { ok: true };
  });

export const transferCoachNetworkAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ fromCoachId: uuid, toCoachId: uuid, reason: z.string().optional() }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile, notifyProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminProfileId = await assertAdminProfile(context.userId);
    if (data.fromCoachId === data.toCoachId) throw new Error("Selecione coaches diferentes");
    const [{ data: fromCoach }, { data: toCoach }] = await Promise.all([
      supabaseAdmin.from("coaches").select("profile_id").eq("id", data.fromCoachId).maybeSingle(),
      supabaseAdmin.from("coaches").select("profile_id").eq("id", data.toCoachId).not("approved_at", "is", null).is("blocked_at", null).maybeSingle(),
    ]);
    if (!fromCoach || !toCoach) throw new Error("Coach de origem ou destino inválido");
    const { count: studentsCount, error: stErr } = await supabaseAdmin.from("students").update({ coach_id: data.toCoachId }, { count: "exact" }).eq("coach_id", data.fromCoachId);
    if (stErr) throw new Error(stErr.message);
    const { count: coachesCount, error: chErr } = await supabaseAdmin.from("coaches").update({ upline_coach_id: data.toCoachId }, { count: "exact" }).eq("upline_coach_id", data.fromCoachId);
    if (chErr) throw new Error(chErr.message);
    await supabaseAdmin.from("coaches").update({ transferred_to_coach_id: data.toCoachId, transferred_at: new Date().toISOString(), inactive_since: new Date().toISOString().slice(0, 10) }).eq("id", data.fromCoachId);
    await supabaseAdmin.from("coach_transfers").insert({ from_coach_id: data.fromCoachId, to_coach_id: data.toCoachId, reason: data.reason || "Migração administrativa de rede.", students_transferred: studentsCount || 0, coaches_transferred: coachesCount || 0, performed_by: adminProfileId });
    await notifyProfile(fromCoach.profile_id, "network_transferred", "Rede remanejada", "Sua rede foi remanejada pelo administrador.", "/coach");
    await notifyProfile(toCoach.profile_id, "network_received", "Nova rede recebida", "Você recebeu alunos/coaches por remanejamento administrativo.", "/coach");
    return { studentsTransferred: studentsCount || 0, coachesTransferred: coachesCount || 0 };
  });