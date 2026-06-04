import { useEffect, useMemo, useState } from "react";
import { Cake, Crown, Activity, Coins, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import StudentDetailsModal from "@/components/coach/StudentDetailsModal";
import { useServerFn } from "@tanstack/react-start";
import { getCoachStudentsTokens } from "@/lib/challenge-tokens.functions";
import { CLASSIFICATION_LABEL, classifyByProfile, type StudentClassification } from "@/lib/student-classifications";
import { CoachAlertsCard } from "@/components/coach/CoachAlertsCard";

type StudentRow = {
  id: string;
  profile_id: string;
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
  hasActiveChallenge: boolean;
};

const fmtBR = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

type SortKey = "recent" | "no_bioimpedance" | "tokens_no_challenge";
type FilterKey = "all" | StudentClassification;

const CLASS_CHIP: Record<StudentClassification, string> = {
  aluno: "bg-white/10 text-white border-white/20",
  aluno_coach: "bg-primary/20 text-primary border-primary/40",
  aluno_profissional: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  aluno_parceiro: "bg-amber-500/20 text-amber-300 border-amber-500/40",
};

export function CoachStudentsTab({ coachId }: { coachId: string }) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [extras, setExtras] = useState<Record<string, ExtraInfo>>({});
  const [classifications, setClassifications] = useState<Record<string, StudentClassification>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const fetchTokens = useServerFn(getCoachStudentsTokens);

  useEffect(() => {
    if (!coachId) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id,profile_id,current_weight,goal_weight,completed_coach_course,created_at,profiles!students_profile_id_fkey(name,email,phone,birthdate,city,state)")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false });

      if (error) toast.error("Erro ao carregar alunos da base");
      const rows = ((data || []) as unknown) as StudentRow[];
      setStudents(rows);
      setLoading(false);

      const ids = rows.map((r) => r.id);
      const profileIds = rows.map((r) => r.profile_id).filter(Boolean);
      if (ids.length === 0) return;

      const [subsRes, assessRes, coachesRes, partnersRes, enrollRes] = await Promise.all([
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
        supabase
          .from("coaches")
          .select("profile_id,is_professional")
          .in("profile_id", profileIds),
        supabase
          .from("partners")
          .select("profile_id")
          .in("profile_id", profileIds),
        supabase
          .from("competition_enrollments")
          .select("student_id,status")
          .in("student_id", ids),
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

      const coachProfiles = new Set<string>();
      const professionalProfiles = new Set<string>();
      ((coachesRes.data || []) as Array<{ profile_id: string; is_professional: boolean | null }>).forEach((c) => {
        coachProfiles.add(c.profile_id);
        if (c.is_professional) professionalProfiles.add(c.profile_id);
      });
      const partnerProfiles = new Set<string>(((partnersRes.data || []) as Array<{ profile_id: string }>).map((p) => p.profile_id));

      const activeStatuses = new Set(["enrolled", "scheduled_initial", "weighed_initial", "scheduled_final", "weighed_final"]);
      const activeChallengeByStudent = new Set<string>();
      ((enrollRes.data || []) as Array<{ student_id: string; status: string }>).forEach((e) => {
        if (activeStatuses.has(e.status)) activeChallengeByStudent.add(e.student_id);
      });

      let tokenBalances = new Map<string, number>();
      try {
        const balRows = await fetchTokens({ data: { studentIds: ids } });
        tokenBalances = new Map(balRows.map((b) => [b.studentId, b.balance]));
      } catch (e) { console.warn("tokens fetch failed", e); }

      const ex: Record<string, ExtraInfo> = {};
      const cls: Record<string, StudentClassification> = {};
      rows.forEach((r) => {
        ex[r.id] = {
          topPlan: topPlanByStudent.get(r.id) || null,
          lastAssessmentDate: lastAssessByStudent.get(r.id) || null,
          tokenBalance: tokenBalances.get(r.id) || 0,
          hasActiveChallenge: activeChallengeByStudent.has(r.id),
        };
        cls[r.id] = classifyByProfile(r.profile_id, coachProfiles, professionalProfiles, partnerProfiles);
      });
      setExtras(ex);
      setClassifications(cls);
    })();
  }, [coachId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = students.filter((s) => {
      const cls = classifications[s.id] || "aluno";
      if (filter !== "all" && cls !== filter) return false;
      if (!term) return true;
      return (s.profiles?.name || "").toLowerCase().includes(term) || (s.profiles?.email || "").toLowerCase().includes(term);
    });

    if (sort === "no_bioimpedance") {
      list = [...list].sort((a, b) => {
        const aHas = extras[a.id]?.lastAssessmentDate ? 1 : 0;
        const bHas = extras[b.id]?.lastAssessmentDate ? 1 : 0;
        if (aHas !== bHas) return aHas - bHas; // sem avaliação primeiro
        return (b.created_at || "").localeCompare(a.created_at || "");
      });
    } else if (sort === "tokens_no_challenge") {
      list = list.filter((s) => (extras[s.id]?.tokenBalance || 0) > 0 && !extras[s.id]?.hasActiveChallenge);
    } else {
      list = [...list].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    }
    return list;
  }, [students, classifications, extras, filter, search, sort]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: students.length, aluno: 0, aluno_coach: 0, aluno_profissional: 0, aluno_parceiro: 0 };
    students.forEach((s) => { c[(classifications[s.id] || "aluno") as FilterKey]++; });
    return c;
  }, [students, classifications]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Base de Alunos</h1>
        <p className="text-sm text-white/50">
          {loading ? "Carregando..." : `${students.length} aluno${students.length === 1 ? "" : "s"} ligado${students.length === 1 ? "" : "s"} diretamente ao seu perfil.`}
        </p>
      </div>
      <CoachAlertsCard coachId={coachId} />

      {/* Busca + filtros */}
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full rounded-xl border border-white/10 bg-[#0F0F0F] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(["all", "aluno", "aluno_coach", "aluno_profissional", "aluno_parceiro"] as FilterKey[]).map((k) => {
            const label = k === "all" ? "Todos" : CLASSIFICATION_LABEL[k];
            const active = filter === k;
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-white/15 bg-white/5 text-white/70 hover:border-white/30"}`}
              >
                {label} <span className="opacity-60">· {counts[k]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            { k: "recent" as SortKey, label: "Últimos cadastrados" },
            { k: "no_bioimpedance" as SortKey, label: "Sem bioimpedância" },
            { k: "tokens_no_challenge" as SortKey, label: "Com moedas e sem desafio" },
          ]).map(({ k, label }) => {
            const active = sort === k;
            return (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${active ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/60 hover:border-white/25"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando alunos...</p> : filtered.length === 0 ? (
          <p className="text-sm text-white/50">
            {students.length === 0 ? "Nenhum aluno ligado a você ainda." : "Nenhum aluno corresponde aos filtros."}
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((student) => {
              const ex = extras[student.id];
              const cls = classifications[student.id] || "aluno";
              return (
                <button
                  key={student.id}
                  onClick={() => setOpenId(student.id)}
                  className="rounded-xl border border-white/5 p-4 text-left transition hover:border-primary/40 hover:bg-white/[0.02]"
                  style={{ backgroundColor: "#0F0F0F" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-bold text-white">{student.profiles?.name || "Aluno"}</h3>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${CLASS_CHIP[cls]}`}>
                          {CLASSIFICATION_LABEL[cls]}
                        </span>
                      </div>
                      <p className="truncate text-xs text-white/45">{student.profiles?.email || "Sem e-mail"}</p>
                      <p className="mt-1 text-[10px] text-white/35">{student.profiles?.phone || "Sem telefone"} {student.profiles?.city ? `· ${student.profiles.city}/${student.profiles.state || ""}` : ""}</p>
                      {student.profiles?.birthdate && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-white/55">
                          <Cake className="h-3 w-3" /> {fmtBR(student.profiles.birthdate)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {student.completed_coach_course && <span className="rounded-full bg-success/20 px-2 py-1 text-[10px] font-bold text-success">Curso coach</span>}
                      {(ex?.tokenBalance ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-1 text-[10px] font-bold text-primary" title="Moedas de desafio disponíveis">
                          <Coins className="h-3 w-3" /> {ex!.tokenBalance} desafio{ex!.tokenBalance > 1 ? "s" : ""}
                        </span>
                      )}
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
