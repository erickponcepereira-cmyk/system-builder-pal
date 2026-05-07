import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Mail, UserCog, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


export const Route = createFileRoute("/admin/students")({
  component: AdminStudents,
});

interface StudentRow {
  id: string;
  coach_id: string | null;
  current_weight: number | null;
  goal_weight: number | null;
  created_at: string | null;
  profiles: { name: string; email: string; phone: string | null; city: string | null } | null;
  coaches: { id: string; profiles: { name: string } | null } | null;
}

interface CoachOption {
  id: string;
  name: string;
}

function AdminStudents() {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "withCoach" | "withProgress">("all");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [newCoachId, setNewCoachId] = useState("");
  const [coachSearch, setCoachSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: studentsData }, { data: coachesData }] = await Promise.all([
      supabase
        .from("students")
        .select(`
          id, coach_id, current_weight, goal_weight, created_at,
          profiles!students_profile_id_fkey(name, email, phone, city),
          coaches!students_coach_id_fkey(id, profiles!coaches_profile_id_fkey(name))
        `)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("coaches")
        .select("id, profiles!coaches_profile_id_fkey(name)")
        .not("approved_at", "is", null)
        .is("blocked_at", null),
    ]);
    setRows((studentsData as unknown as StudentRow[]) || []);
    setCoaches(
      ((coachesData || []) as Array<{ id: string; profiles: { name: string } | null }>)
        .map((c) => ({ id: c.id, name: c.profiles?.name || "Coach" }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (statusFilter === "withCoach" && !r.coaches?.profiles?.name) return false;
    if (statusFilter === "withProgress" && !r.current_weight) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return r.profiles?.name.toLowerCase().includes(q) || r.profiles?.email.toLowerCase().includes(q) || r.coaches?.profiles?.name?.toLowerCase().includes(q);
  });

  const filteredCoaches = useMemo(() => {
    const q = coachSearch.trim().toLowerCase();
    if (!q) return coaches.slice(0, 50);
    return coaches.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [coachSearch, coaches]);

  const openEdit = (row: StudentRow) => {
    setEditing(row);
    setNewCoachId(row.coach_id || "");
    setCoachSearch("");
  };

  const saveCoach = async () => {
    if (!editing || !newCoachId) {
      toast.error("Selecione um coach");
      return;
    }
    if (newCoachId === editing.coach_id) {
      setEditing(null);
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_change_student_coach" as never, {
      _student_id: editing.id,
      _new_coach_id: newCoachId,
    } as never);
    setSaving(false);
    if (error) {
      console.error("[admin_change_student_coach]", error);
      toast.error(error.message || "Erro ao trocar coach");
      return;
    }
    toast.success("Coach atualizado");
    setEditing(null);
    await load();
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Alunos</h1>
        <p className="text-sm text-white/50">Todos os alunos cadastrados na plataforma</p>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input
            type="text"
            placeholder="Buscar aluno, e-mail ou coach..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl pl-10 pr-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
            style={{ backgroundColor: "#1A1A1A" }}
          />
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "#1A1A1A" }}>
          {(["all", "withCoach", "withProgress"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`rounded-lg px-3 py-2 text-xs font-bold ${statusFilter === filter ? "bg-primary text-primary-foreground" : "text-white/60"}`}
            >
              {filter === "all" ? "Todos" : filter === "withCoach" ? "Com coach" : "Com evolução"}
            </button>
          ))}
        </div>
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
                  <th className="p-3 text-right">Ações</th>
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
                    <td className="p-3 text-right">
                      <button
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/25"
                      >
                        <UserCog className="h-3.5 w-3.5" /> Trocar coach
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 p-5" style={{ backgroundColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-white">Trocar coach do aluno</h2>
                <p className="text-xs text-white/50">{editing.profiles?.name}</p>
              </div>
              <button onClick={() => !saving && setEditing(null)} className="rounded-lg p-1 text-white/50 hover:bg-white/5 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-2 text-xs text-white/50">Coach atual: <span className="font-bold text-white">{editing.coaches?.profiles?.name || "Nenhum"}</span></p>

            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <input
                type="text"
                value={coachSearch}
                onChange={(e) => setCoachSearch(e.target.value)}
                placeholder="Buscar coach..."
                className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-2">
              {filteredCoaches.length === 0 ? (
                <p className="p-3 text-xs text-white/50">Nenhum coach encontrado.</p>
              ) : (
                filteredCoaches.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setNewCoachId(c.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${newCoachId === c.id ? "bg-primary text-primary-foreground" : "text-white/80 hover:bg-white/5"}`}
                  >
                    {c.name}
                  </button>
                ))
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEditing(null)}
                disabled={saving}
                className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={saveCoach}
                disabled={saving || !newCoachId}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
