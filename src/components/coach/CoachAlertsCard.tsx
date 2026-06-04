import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, UserPlus, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type StudentRow = {
  id: string;
  created_at: string | null;
  profiles: { name: string | null } | null;
};

type Assess = { student_id: string; assessment_date: string };

const NEW_STUDENT_HOURS = 48;
const NO_ASSESSMENT_DAYS = 7;

// Avoid re-toasting on every mount/re-render in the same session
const notifiedKey = (coachId: string) => `fitmind_coach_alerts_${coachId}`;

export function CoachAlertsCard({ coachId, variant = "default" }: { coachId: string; variant?: "default" | "compact" }) {
  const [newStudents, setNewStudents] = useState<StudentRow[]>([]);
  const [noAssess, setNoAssess] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId) { setLoading(false); return; }
    (async () => {
      const cutoffNew = new Date(Date.now() - NEW_STUDENT_HOURS * 3600 * 1000).toISOString();
      const cutoffAssess = new Date(Date.now() - NO_ASSESSMENT_DAYS * 86400 * 1000).toISOString();

      const { data: rows } = await supabase
        .from("students")
        .select("id,created_at,profiles!students_profile_id_fkey(name)")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false });

      const list = ((rows || []) as unknown) as StudentRow[];
      const ids = list.map((s) => s.id);

      let assessByStudent = new Map<string, string>();
      if (ids.length) {
        const { data: ad } = await supabase
          .from("coach_body_assessments")
          .select("student_id,assessment_date")
          .in("student_id", ids)
          .order("assessment_date", { ascending: false });
        ((ad || []) as Assess[]).forEach((a) => {
          if (!assessByStudent.has(a.student_id)) assessByStudent.set(a.student_id, a.assessment_date);
        });
      }

      const newOnes = list.filter((s) => (s.created_at || "") >= cutoffNew);
      const overdue = list.filter((s) => {
        if ((s.created_at || "") >= cutoffAssess) return false; // só após Y dias de cadastro
        const last = assessByStudent.get(s.id);
        return !last;
      });

      setNewStudents(newOnes);
      setNoAssess(overdue);
      setLoading(false);

      // notificações (1x por sessão por conjunto)
      try {
        const key = notifiedKey(coachId);
        const prev = JSON.parse(sessionStorage.getItem(key) || "{}") as { new?: string[]; overdue?: string[] };
        const newIds = newOnes.map((s) => s.id).sort();
        const overdueIds = overdue.map((s) => s.id).sort();

        const newDiff = newIds.filter((id) => !(prev.new || []).includes(id));
        if (newDiff.length) {
          toast.success(`${newDiff.length} novo${newDiff.length > 1 ? "s" : ""} aluno${newDiff.length > 1 ? "s" : ""} entrou na sua base!`);
        }
        const overdueDiff = overdueIds.filter((id) => !(prev.overdue || []).includes(id));
        if (overdueDiff.length) {
          toast.warning(`${overdueDiff.length} aluno${overdueDiff.length > 1 ? "s" : ""} há mais de ${NO_ASSESSMENT_DAYS} dias sem avaliação.`);
        }
        sessionStorage.setItem(key, JSON.stringify({ new: newIds, overdue: overdueIds }));
      } catch { /* ignore storage errors */ }
    })();
  }, [coachId]);

  const hasAny = useMemo(() => newStudents.length + noAssess.length > 0, [newStudents, noAssess]);

  if (loading || !hasAny) return null;

  return (
    <div
      className={`rounded-2xl border border-amber-500/30 ${variant === "compact" ? "p-3" : "p-4"} mb-4`}
      style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.10), rgba(239,68,68,0.06))" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Prioridades · Alertas</p>
      </div>
      <div className="space-y-2">
        {newStudents.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-2.5">
            <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-emerald-200">
                {newStudents.length} novo{newStudents.length > 1 ? "s" : ""} aluno{newStudents.length > 1 ? "s" : ""} nas últimas {NEW_STUDENT_HOURS}h
              </p>
              <p className="truncate text-[11px] text-white/60">
                {newStudents.slice(0, 3).map((s) => s.profiles?.name || "Aluno").join(", ")}
                {newStudents.length > 3 ? ` +${newStudents.length - 3}` : ""}
              </p>
            </div>
          </div>
        )}
        {noAssess.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2.5">
            <Activity className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-200">
                {noAssess.length} aluno{noAssess.length > 1 ? "s" : ""} há mais de {NO_ASSESSMENT_DAYS} dias sem avaliação!
              </p>
              <p className="truncate text-[11px] text-white/60">
                {noAssess.slice(0, 3).map((s) => s.profiles?.name || "Aluno").join(", ")}
                {noAssess.length > 3 ? ` +${noAssess.length - 3}` : ""}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CoachAlertsCard;
