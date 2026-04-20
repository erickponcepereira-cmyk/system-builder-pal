import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/students")({
  component: AdminStudents,
});

interface StudentRow {
  id: string;
  current_weight: number | null;
  goal_weight: number | null;
  created_at: string | null;
  profiles: { name: string; email: string; phone: string | null; city: string | null } | null;
  coaches: { profiles: { name: string } | null } | null;
}

function AdminStudents() {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("students")
        .select(`
          id, current_weight, goal_weight, created_at,
          profiles!students_profile_id_fkey(name, email, phone, city),
          coaches!students_coach_id_fkey(profiles!coaches_profile_id_fkey(name))
        `)
        .order("created_at", { ascending: false })
        .limit(200);
      setRows((data as unknown as StudentRow[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.profiles?.name.toLowerCase().includes(q) || r.profiles?.email.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Alunos</h1>
        <p className="text-sm text-white/50">Todos os alunos cadastrados na plataforma</p>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        <input
          type="text"
          placeholder="Buscar aluno..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl pl-10 pr-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
          style={{ backgroundColor: "#1A1A1A" }}
        />
      </div>

      <div className="rounded-2xl overflow-hidden border border-white/5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? (
          <p className="p-8 text-white/50">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-white/50">Nenhum aluno encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-left text-[11px] uppercase text-white/50">
                <tr>
                  <th className="p-3">Aluno</th>
                  <th className="p-3 hidden sm:table-cell">Coach</th>
                  <th className="p-3 hidden md:table-cell">Cidade</th>
                  <th className="p-3 text-right">Peso atual</th>
                  <th className="p-3 text-right hidden sm:table-cell">Meta</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                    <td className="p-3">
                      <div className="font-medium text-white">{r.profiles?.name}</div>
                      <div className="flex items-center gap-1 text-[11px] text-white/50">
                        <Mail className="h-3 w-3" /> {r.profiles?.email}
                      </div>
                    </td>
                    <td className="p-3 hidden sm:table-cell text-white/70">{r.coaches?.profiles?.name || "—"}</td>
                    <td className="p-3 hidden md:table-cell text-white/70">{r.profiles?.city || "—"}</td>
                    <td className="p-3 text-right text-white">{r.current_weight ? `${r.current_weight} kg` : "—"}</td>
                    <td className="p-3 text-right hidden sm:table-cell text-white/70">{r.goal_weight ? `${r.goal_weight} kg` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
