import { useEffect, useState } from "react";
import { Cake, Crown, Activity, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import StudentDetailsModal from "@/components/coach/StudentDetailsModal";
import { useServerFn } from "@tanstack/react-start";
import { getCoachStudentsTokens } from "@/lib/challenge-tokens.functions";

type StudentRow = {
  id: string;
  current_weight: number | null;
  goal_weight: number | null;
  completed_coach_course: boolean | null;
  created_at: string | null;
  profiles: { name: string; email: string; phone: string | null; birthdate: string | null; city: string | null; state: string | null } | null;
};

type ExtraInfo = {
  topPlan: { name: string; price: number | null } | null;
  lastAssessmentDate: string | null;
  tokenBalance: number;
};

const fmtBR = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

export function CoachStudentsTab({ coachId }: { coachId: string }) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [extras, setExtras] = useState<Record<string, ExtraInfo>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const fetchTokens = useServerFn(getCoachStudentsTokens);

  useEffect(() => {
    if (!coachId) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id,current_weight,goal_weight,completed_coach_course,created_at,profiles!students_profile_id_fkey(name,email,phone,birthdate,city,state)")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false });
      if (error) toast.error("Erro ao carregar alunos da base");
      const rows = ((data || []) as unknown) as StudentRow[];
      setStudents(rows);
      setLoading(false);

      // Fetch extras (top active plan + last assessment date) in parallel
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return;
      const [subsRes, assessRes] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("student_id,status,products!subscriptions_product_id_fkey(name,price)")
          .in("student_id", ids)
          .eq("status", "active"),
        supabase
          .from("coach_body_assessments")
          .select("student_id,assessment_date")
          .in("student_id", ids)
          .order("assessment_date", { ascending: false }),
      ]);
      const topPlanByStudent = new Map<string, { name: string; price: number | null }>();
      ((subsRes.data || []) as Array<{ student_id: string; products: { name: string; price: number | null } | null }>).forEach((s) => {
        if (!s.products) return;
        const cur = topPlanByStudent.get(s.student_id);
        if (!cur || (Number(s.products.price) || 0) > (Number(cur.price) || 0)) {
          topPlanByStudent.set(s.student_id, { name: s.products.name, price: s.products.price });
        }
      });
      const lastAssessByStudent = new Map<string, string>();
      ((assessRes.data || []) as Array<{ student_id: string; assessment_date: string }>).forEach((a) => {
        if (!lastAssessByStudent.has(a.student_id)) lastAssessByStudent.set(a.student_id, a.assessment_date);
      });
      const ex: Record<string, ExtraInfo> = {};
      // Saldo de moedas de desafio por aluno
      let tokenBalances = new Map<string, number>();
      try {
        const balRows = await fetchTokens({ data: { studentIds: ids } });
        tokenBalances = new Map(balRows.map((b) => [b.studentId, b.balance]));
      } catch (e) { console.warn("tokens fetch failed", e); }

      ids.forEach((id) => {
        ex[id] = {
          topPlan: topPlanByStudent.get(id) || null,
          lastAssessmentDate: lastAssessByStudent.get(id) || null,
          tokenBalance: tokenBalances.get(id) || 0,
        };
      });
      setExtras(ex);
    })();
  }, [coachId]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Base de Alunos</h1>
        <p className="text-sm text-white/50">Todos os alunos ligados diretamente ao seu perfil. Toque para ver detalhes.</p>
      </div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando alunos...</p> : students.length === 0 ? <p className="text-sm text-white/50">Nenhum aluno ligado a você ainda.</p> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {students.map((student) => {
              const ex = extras[student.id];
              return (
                <button
                  key={student.id}
                  onClick={() => setOpenId(student.id)}
                  className="rounded-xl border border-white/5 p-4 text-left transition hover:border-primary/40 hover:bg-white/[0.02]"
                  style={{ backgroundColor: "#0F0F0F" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-white">{student.profiles?.name || "Aluno"}</h3>
                      <p className="truncate text-xs text-white/45">{student.profiles?.email || "Sem e-mail"}</p>
                      <p className="mt-1 text-[10px] text-white/35">{student.profiles?.phone || "Sem telefone"} {student.profiles?.city ? `· ${student.profiles.city}/${student.profiles.state || ""}` : ""}</p>
                      {student.profiles?.birthdate && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-white/55">
                          <Cake className="h-3 w-3" /> {fmtBR(student.profiles.birthdate)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${student.completed_coach_course ? "bg-success/20 text-success" : "bg-white/10 text-white/60"}`}>{student.completed_coach_course ? "Curso coach" : "Aluno"}</span>
                      <WhatsAppButton phone={student.profiles?.phone} size="sm" message={`Olá ${student.profiles?.name?.split(" ")[0] || ""}!`} />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="flex items-center gap-1 text-white/40"><Crown className="h-3 w-3" /> Plano (maior valor ativo)</p>
                      <p className="truncate font-bold text-white">{ex?.topPlan ? ex.topPlan.name : "—"}</p>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="flex items-center gap-1 text-white/40"><Activity className="h-3 w-3" /> Última avaliação</p>
                      <p className="font-bold text-white">{ex?.lastAssessmentDate ? fmtBR(ex.lastAssessmentDate) : "—"}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {openId && <StudentDetailsModal studentId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

export default CoachStudentsTab;
