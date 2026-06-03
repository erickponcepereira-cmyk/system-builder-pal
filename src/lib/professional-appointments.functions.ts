import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProfessionalAppointmentItem = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  cancellation_window_hours: number;
  notes: string | null;
  student_id: string;
  product_id: string;
  seller_coach_id: string | null;
  order_id: string | null;
  student_name: string | null;
  student_avatar_url: string | null;
  student_email: string | null;
  student_phone: string | null;
  student_coach_name: string | null;
  seller_name: string | null;
  product_name: string | null;
  order_status: string | null;
  order_number: string | null;
};

export type ProfessionalStudentDetail = {
  profile: { name: string; email: string; phone: string | null; birthdate: string | null; city: string | null; state: string | null } | null;
  subs: Array<{ id: string; status: string; start_date: string; end_date: string; products: { id: string; name: string; price: number | null } | null }>;
  txs: Array<{ id: string; gross_amount: number; status: string; paid_at: string | null; created_at: string; products: { name: string } | null }>;
  bodyAssess: Array<{ id: string; assessment_date: string; weight: number | null; body_fat: number | null; muscle_mass: number | null; skeletal_muscle: number | null; basal_metabolism: number | null; bmi: number | null; client_notes: string | null; professional_notes: string | null }>;
  bios: Array<{ id: string; evaluation_date: string; evaluation_type: string; weight: number | null; fat_percentage: number | null; muscle_percentage: number | null }>;
  anams: Array<{ id: string; filled_at: string | null; objective: string | null; confirmed_at: string | null; gender: string | null; height: number | null; protocol_reason: string | null; preexisting_conditions: string | null; current_medications: string | null; food_allergies: string | null; sleep_hours: string | null; stress_level: string | null; exercises_regularly: boolean | null; additional_observations: string | null; blood_type: string | null; food_intolerances: string | null; has_diabetes: boolean | null; has_hypertension: boolean | null; has_cardiopathy: boolean | null; other_chronic_conditions: string | null; surgical_history: string | null; supplements_used: string | null }>;
  weights: Array<{ id: string; log_date: string; weight: number; waist_cm: number | null; hip_cm: number | null }>;
  photos: Array<{ id: string; photo_url: string; photo_date: string; caption: string | null }>;
  confidentialNotes: Array<{ id: string; title: string; content: string; created_at: string; updated_at: string }>;
  canViewConfidentialMedicalNotes: boolean;
};

async function getProfessionalContext(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) throw new Error("Perfil não encontrado");

  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id,is_professional,specialty_key")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!coach || !coach.is_professional) throw new Error("Acesso restrito a profissionais");

  let canViewConfidentialMedicalNotes = false;
  if (coach.specialty_key) {
    const { data: specialty } = await supabaseAdmin
      .from("professional_specialties")
      .select("capabilities")
      .eq("key", coach.specialty_key)
      .maybeSingle();
    const caps = (specialty?.capabilities || {}) as Record<string, unknown>;
    canViewConfidentialMedicalNotes = caps.can_view_confidential_medical_notes === true;
  }

  return { supabaseAdmin, profileId: profile.id as string, coachId: coach.id as string, canViewConfidentialMedicalNotes };
}

export const getProfessionalAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, coachId } = await getProfessionalContext(context.userId);
    const { data: appts, error } = await supabaseAdmin
      .from("professional_appointments")
      .select("id,starts_at,ends_at,status,cancellation_window_hours,notes,student_id,product_id,seller_coach_id,order_id")
      .eq("professional_coach_id", coachId)
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);

    const rows = (appts || []) as Array<{
      id: string; starts_at: string; ends_at: string; status: string; cancellation_window_hours: number; notes: string | null; student_id: string; product_id: string; seller_coach_id: string | null; order_id: string | null;
    }>;
    const studentIds = Array.from(new Set(rows.map((r) => r.student_id)));
    const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
    const sellerIds = Array.from(new Set(rows.map((r) => r.seller_coach_id).filter(Boolean))) as string[];
    const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter(Boolean))) as string[];

    const [{ data: students }, { data: products }, { data: sellers }, { data: orders }] = await Promise.all([
      studentIds.length
        ? supabaseAdmin.from("students").select("id,coach_id,profiles!students_profile_id_fkey(name,email,phone,avatar_url)").in("id", studentIds)
        : Promise.resolve({ data: [] }),
      productIds.length
        ? supabaseAdmin.from("professional_products").select("id,name").in("id", productIds)
        : Promise.resolve({ data: [] }),
      sellerIds.length
        ? supabaseAdmin.from("coaches").select("id,profiles!coaches_profile_id_fkey(name)").in("id", sellerIds)
        : Promise.resolve({ data: [] }),
      orderIds.length
        ? supabaseAdmin.from("partner_product_orders").select("id,status,order_number").in("id", orderIds)
        : Promise.resolve({ data: [] }),
    ]);

    type StudentRow = { id: string; coach_id: string | null; profiles: { name: string | null; email: string | null; phone: string | null; avatar_url: string | null } | null };
    type ProductRow = { id: string; name: string | null };
    type CoachRow = { id: string; profiles: { name: string | null } | null };
    type OrderRow = { id: string; status: string | null; order_number: string | null };

    const studentRows = ((students || []) as unknown) as StudentRow[];
    const studentCoachIds = Array.from(new Set(studentRows.map((s) => s.coach_id).filter(Boolean))) as string[];
    const { data: studentCoaches } = studentCoachIds.length
      ? await supabaseAdmin.from("coaches").select("id,profiles!coaches_profile_id_fkey(name)").in("id", studentCoachIds)
      : { data: [] };

    const studentMap = new Map(studentRows.map((s) => [s.id, s]));
    const productMap = new Map((((products || []) as unknown) as ProductRow[]).map((p) => [p.id, p]));
    const sellerMap = new Map((((sellers || []) as unknown) as CoachRow[]).map((c) => [c.id, c]));
    const coachMap = new Map(((((studentCoaches || []) as unknown) as CoachRow[])).map((c) => [c.id, c]));
    const orderMap = new Map((((orders || []) as unknown) as OrderRow[]).map((o) => [o.id, o]));

    return rows.map<ProfessionalAppointmentItem>((a) => {
      const student = studentMap.get(a.student_id);
      const seller = a.seller_coach_id ? sellerMap.get(a.seller_coach_id) : null;
      const studentCoach = student?.coach_id ? coachMap.get(student.coach_id) : null;
      const order = a.order_id ? orderMap.get(a.order_id) : null;
      return {
        ...a,
        student_name: student?.profiles?.name || null,
        student_avatar_url: student?.profiles?.avatar_url || null,
        student_email: student?.profiles?.email || null,
        student_phone: student?.profiles?.phone || null,
        student_coach_name: studentCoach?.profiles?.name || null,
        seller_name: seller?.profiles?.name || null,
        product_name: productMap.get(a.product_id)?.name || null,
        order_status: order?.status || null,
        order_number: order?.order_number || null,
      };
    });
  });

export const getProfessionalStudentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { studentId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, coachId, canViewConfidentialMedicalNotes } = await getProfessionalContext(context.userId);

    const { data: allowed } = await supabaseAdmin
      .from("professional_appointments")
      .select("id")
      .eq("professional_coach_id", coachId)
      .eq("student_id", data.studentId)
      .limit(1)
      .maybeSingle();
    if (!allowed) throw new Error("Você não tem acesso a este aluno");

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("profile_id,profiles!students_profile_id_fkey(name,email,phone,birthdate,city,state)")
      .eq("id", data.studentId)
      .maybeSingle();
    if (!student) throw new Error("Aluno não encontrado");

    const [subRes, txRes, bodyRes, bioRes, anamRes, wRes, pRes, notesRes] = await Promise.all([
      supabaseAdmin.from("subscriptions").select("id,status,start_date,end_date,products!subscriptions_product_id_fkey(id,name,price)").eq("student_id", data.studentId).order("end_date", { ascending: false }),
      supabaseAdmin.from("transactions").select("id,gross_amount,status,paid_at,created_at,products!transactions_product_id_fkey(name)").eq("student_id", data.studentId).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("coach_body_assessments").select("id,assessment_date,weight,body_fat,muscle_mass,skeletal_muscle,basal_metabolism,bmi,client_notes,professional_notes").eq("student_id", data.studentId).order("assessment_date", { ascending: false }),
      supabaseAdmin.from("bioimpedance_evaluations").select("id,evaluation_date,evaluation_type,weight,fat_percentage,muscle_percentage").eq("student_id", data.studentId).order("evaluation_date", { ascending: false }),
      supabaseAdmin.from("anamnesis_forms").select("id,filled_at,objective,confirmed_at,gender,height,protocol_reason,preexisting_conditions,current_medications,food_allergies,sleep_hours,stress_level,exercises_regularly,additional_observations,blood_type,food_intolerances,has_diabetes,has_hypertension,has_cardiopathy,other_chronic_conditions,surgical_history,supplements_used").eq("student_id", data.studentId).order("filled_at", { ascending: false }),
      supabaseAdmin.from("weight_logs").select("id,log_date,weight,waist_cm,hip_cm").eq("student_id", data.studentId).order("log_date", { ascending: false }).limit(60),
      supabaseAdmin.from("evolution_photos").select("id,photo_url,photo_date,caption").eq("student_id", data.studentId).order("photo_date", { ascending: false }).limit(24),
      canViewConfidentialMedicalNotes
        ? supabaseAdmin.from("student_medical_confidential_notes").select("id,title,content,created_at,updated_at").eq("student_id", data.studentId).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    return {
      profile: (((student as unknown) as { profiles: ProfessionalStudentDetail["profile"] })?.profiles) || null,
      subs: ((subRes.data || []) as unknown) as ProfessionalStudentDetail["subs"],
      txs: ((txRes.data || []) as unknown) as ProfessionalStudentDetail["txs"],
      bodyAssess: ((bodyRes.data || []) as unknown) as ProfessionalStudentDetail["bodyAssess"],
      bios: ((bioRes.data || []) as unknown) as ProfessionalStudentDetail["bios"],
      anams: ((anamRes.data || []) as unknown) as ProfessionalStudentDetail["anams"],
      weights: ((wRes.data || []) as unknown) as ProfessionalStudentDetail["weights"],
      photos: ((pRes.data || []) as unknown) as ProfessionalStudentDetail["photos"],
      confidentialNotes: ((notesRes.data || []) as unknown) as ProfessionalStudentDetail["confidentialNotes"],
      canViewConfidentialMedicalNotes,
    } satisfies ProfessionalStudentDetail;
  });