import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WhatsAppButton } from "@/components/WhatsAppButton";

export function CoachStudentsTab({ coachId }: { coachId: string }) {
  const [students, setStudents] = useState<{ id: string; current_weight: number | null; goal_weight: number | null; completed_coach_course: boolean | null; created_at: string | null; profiles: { name: string; email: string; phone: string | null; city: string | null; state: string | null } | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id,current_weight,goal_weight,completed_coach_course,created_at,profiles!students_profile_id_fkey(name,email,phone,city,state)")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false });
      if (error) toast.error("Erro ao carregar alunos da base");
      setStudents((data as unknown as typeof students) || []);
      setLoading(false);
    })();
  }, [coachId]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Base de Alunos</h1>
        <p className="text-sm text-white/50">Todos os alunos ligados diretamente ao seu perfil</p>
      </div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando alunos...</p> : students.length === 0 ? <p className="text-sm text-white/50">Nenhum aluno ligado a você ainda.</p> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {students.map((student) => (
              <div key={student.id} className="rounded-xl border border-white/5 p-4" style={{ backgroundColor: "#0F0F0F" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-white">{student.profiles?.name || "Aluno"}</h3>
                    <p className="truncate text-xs text-white/45">{student.profiles?.email || "Sem e-mail"}</p>
                    <p className="mt-1 text-[10px] text-white/35">{student.profiles?.phone || "Sem telefone"} {student.profiles?.city ? `· ${student.profiles.city}/${student.profiles.state || ""}` : ""}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${student.completed_coach_course ? "bg-success/20 text-success" : "bg-white/10 text-white/60"}`}>{student.completed_coach_course ? "Curso coach" : "Aluno"}</span>
                    <WhatsAppButton phone={student.profiles?.phone} size="sm" message={`Olá ${student.profiles?.name?.split(" ")[0] || ""}!`} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-white/5 p-2"><p className="text-white/35">Peso atual</p><p className="font-bold text-white">{student.current_weight ? `${student.current_weight} kg` : "—"}</p></div>
                  <div className="rounded-lg bg-white/5 p-2"><p className="text-white/35">Meta</p><p className="font-bold text-white">{student.goal_weight ? `${student.goal_weight} kg` : "—"}</p></div>
                  <div className="rounded-lg bg-white/5 p-2"><p className="text-white/35">Entrada</p><p className="font-bold text-white">{student.created_at ? new Date(student.created_at).toLocaleDateString("pt-BR") : "—"}</p></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default CoachStudentsTab;

