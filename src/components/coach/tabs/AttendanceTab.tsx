import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppButton } from "@/components/WhatsAppButton";

export function AttendanceTab() {
  const [rows, setRows] = useState<{ id: string; name: string; email: string; phone: string | null; attendance: number; last: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = userData.user ? await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle() : { data: null };
      const { data: coach } = profile?.id ? await supabase.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle() : { data: null };
      if (!coach?.id) { setLoading(false); return; }
      const { data: students } = await supabase.from("students").select("id,profiles!students_profile_id_fkey(name,email,phone)").eq("coach_id", coach.id);
      const studentRows = (students as unknown as { id: string; profiles: { name: string; email: string; phone: string | null } | null }[]) || [];
      const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const { data: logs } = studentRows.length > 0 ? await supabase.from("attendance_logs").select("student_id,log_date,attended").in("student_id", studentRows.map((student) => student.id)).gte("log_date", since) : { data: [] };
      const logRows = (logs as unknown as { student_id: string; log_date: string; attended: boolean | null }[]) || [];
      setRows(studentRows.map((student) => {
        const ownLogs = logRows.filter((log) => log.student_id === student.id && log.attended);
        return {
          id: student.id,
          name: student.profiles?.name || "Aluno",
          email: student.profiles?.email || "",
          phone: student.profiles?.phone || null,
          attendance: Math.round((new Set(ownLogs.map((log) => log.log_date)).size / 30) * 100),
          last: ownLogs.sort((a, b) => b.log_date.localeCompare(a.log_date))[0]?.log_date || "—",
        };
      }));
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Frequência dos Alunos</h1>
        <p className="text-sm text-white/50">Check-ins reais dos últimos 30 dias</p>
      </div>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando frequência...</p> : rows.length === 0 ? <p className="text-sm text-white/50">Nenhum aluno encontrado.</p> : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl p-3" style={{ backgroundColor: "#0F0F0F" }}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{row.name}</p><p className="truncate text-[10px] text-white/40">{row.email}</p></div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-primary">{row.attendance}%</span>
                    <WhatsAppButton phone={row.phone} size="icon" message={`Olá ${row.name.split(" ")[0]}, tudo bem? Como está sua frequência semanal?`} />
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.attendance)}%` }} /></div>
                <p className="mt-1 text-[10px] text-white/40">Último check-in: {row.last === "—" ? "—" : new Date(row.last).toLocaleDateString("pt-BR")}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default AttendanceTab;

