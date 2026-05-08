import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type CoachContext } from "@/routes/coach";

type TreeCoach = { id: string; profile_id: string; upline_coach_id: string | null; total_active_students: number | null; profiles: { name: string; email: string; patent: string | null } | null };

export function NetworkTreeTab({ coach }: { coach: CoachContext | null }) {
  const [upline, setUpline] = useState<TreeCoach | null>(null);
  const [downline, setDownline] = useState<TreeCoach[]>([]);
  const [students, setStudents] = useState<{ id: string; profiles: { name: string; email: string } | null }[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!coach?.coachId) return;
    (async () => {
      if (coach.uplineCoachId) {
        const { data } = await supabase.from("coaches").select("id,profile_id,upline_coach_id,total_active_students,profiles!coaches_profile_id_fkey(name,email,patent)").eq("id", coach.uplineCoachId).maybeSingle();
        setUpline(data as unknown as TreeCoach | null);
      }
      const [{ data: allCoaches }, { data: studentRows }] = await Promise.all([
        supabase.from("coaches").select("id,profile_id,upline_coach_id,total_active_students,profiles!coaches_profile_id_fkey(name,email,patent)"),
        supabase.from("students").select("id,profiles!students_profile_id_fkey(name,email)").eq("coach_id", coach.coachId),
      ]);
      const coachRows = ((allCoaches as unknown as TreeCoach[]) || []);
      const descendants: TreeCoach[] = [];
      const collect = (parentId: string) => {
        coachRows.filter((item) => item.upline_coach_id === parentId).forEach((item) => {
          descendants.push(item);
          collect(item.id);
        });
      };
      collect(coach.coachId);
      setDownline(descendants);
      setStudents((studentRows as unknown as typeof students) || []);
    })();
  }, [coach?.coachId, coach?.uplineCoachId]);

  const PersonNode = ({ title, subtitle, tone = "white" }: { title: string; subtitle: string; tone?: "primary" | "success" | "white" }) => (
    <div className={`rounded-xl border p-4 ${tone === "primary" ? "border-primary/40 bg-primary/10" : tone === "success" ? "border-success/30 bg-success/10" : "border-white/10 bg-white/5"}`}>
      <p className="text-sm font-bold text-white">{title}</p>
      <p className="text-xs text-white/45">{subtitle}</p>
    </div>
  );

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Árvore da Rede</h1>
        <p className="text-sm text-white/50">Quem está acima, você no centro e quem está abaixo</p>
      </div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-white/35">Acima de você</p>
            {upline ? <PersonNode title={upline.profiles?.name || "Coach acima"} subtitle={upline.profiles?.email || "Upline"} /> : <PersonNode title="Sem coach acima" subtitle="Você está no topo desta ramificação" />}
          </div>
          <div className="pl-5 border-l border-primary/40">
            <PersonNode title={coach?.name || "Você"} subtitle={`${coach?.referralCode || "—"} · ${coach?.totalActiveStudents || 0} alunos diretos`} tone="primary" />
          </div>
          <div className="pl-10 border-l border-white/10">
            <button onClick={() => setOpen(!open)} className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-white/45">{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Abaixo de você</button>
            {open && <div className="grid gap-3 md:grid-cols-2">
              {downline.map((item) => <PersonNode key={item.id} title={item.profiles?.name || "Coach"} subtitle={`Coach ligado · ${item.total_active_students || 0} alunos`} tone="success" />)}
              {students.map((item) => <PersonNode key={item.id} title={item.profiles?.name || "Aluno"} subtitle={item.profiles?.email || "Aluno direto"} />)}
              {downline.length + students.length === 0 && <p className="text-sm text-white/50">Nenhum aluno ou coach abaixo ainda.</p>}
            </div>}
          </div>
        </div>
      </div>
    </>
  );
}

export default NetworkTreeTab;
