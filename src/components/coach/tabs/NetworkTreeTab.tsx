import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Users, Award, Dot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { type CoachContext } from "@/routes/coach";

type CoachRow = {
  id: string;
  profile_id: string;
  upline_coach_id: string | null;
  profiles: { name: string; email: string; phone: string | null; patent: string | null } | null;
};
type StudentRow = { id: string; coach_id: string; profile_id: string; profiles: { name: string; email: string } | null };
type BadgeRow = { coach_id: string; badge_key: string };

const BADGE_LABELS: Record<string, string> = {
  nutritionist_partner: "Nutricionista",
  master_coach: "Master Coach",
  council: "Conselho",
  coach_hbl_42: "HBL 42",
};

function Badges({ keys }: { keys: string[] }) {
  if (!keys.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {keys.map((k) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-semibold">
          <Award className="h-2.5 w-2.5" /> {BADGE_LABELS[k] || k}
        </span>
      ))}
    </div>
  );
}

export function NetworkTreeTab({ coach }: { coach: CoachContext | null }) {
  const [allCoaches, setAllCoaches] = useState<CoachRow[]>([]);
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!coach?.coachId) return;
    (async () => {
      const [{ data: c }, { data: s }, { data: b }] = await Promise.all([
        supabase.from("coaches").select("id,profile_id,upline_coach_id,profiles!coaches_profile_id_fkey(name,email,phone,patent)"),
        supabase.from("students").select("id,coach_id,profile_id,profiles!students_profile_id_fkey(name,email)"),
        supabase.from("coach_badges").select("coach_id,badge_key"),
      ]);
      setAllCoaches((c as unknown as CoachRow[]) || []);
      setAllStudents((s as unknown as StudentRow[]) || []);
      setBadges((b as unknown as BadgeRow[]) || []);
    })();
  }, [coach?.coachId]);

  const { coachesByUpline, studentsByCoach, badgesByCoach, coachProfileIds, upline } = useMemo(() => {
    const cbu = new Map<string, CoachRow[]>();
    allCoaches.forEach((c) => {
      const k = c.upline_coach_id || "__root__";
      const arr = cbu.get(k) || [];
      arr.push(c);
      cbu.set(k, arr);
    });
    const sbc = new Map<string, StudentRow[]>();
    allStudents.forEach((s) => {
      const arr = sbc.get(s.coach_id) || [];
      arr.push(s);
      sbc.set(s.coach_id, arr);
    });
    const bbc = new Map<string, string[]>();
    badges.forEach((b) => {
      const arr = bbc.get(b.coach_id) || [];
      arr.push(b.badge_key);
      bbc.set(b.coach_id, arr);
    });
    const cpids = new Set(allCoaches.map((c) => c.profile_id));
    const up = coach?.uplineCoachId ? allCoaches.find((c) => c.id === coach.uplineCoachId) : null;
    return { coachesByUpline: cbu, studentsByCoach: sbc, badgesByCoach: bbc, coachProfileIds: cpids, upline: up };
  }, [allCoaches, allStudents, badges, coach?.uplineCoachId]);

  // Direct student count (excluding those who are also coaches)
  const directStudentCount = (coachId: string) => {
    const ss = studentsByCoach.get(coachId) || [];
    return ss.filter((s) => !coachProfileIds.has(s.profile_id)).length;
  };
  const childCoachCount = (coachId: string) => (coachesByUpline.get(coachId) || []).length;

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  // Renders one coach node + its descendants up to maxDepth levels deeper.
  const renderNode = (c: CoachRow, depth: number, maxDepth: number) => {
    const isOpen = !!expanded[c.id];
    const children = coachesByUpline.get(c.id) || [];
    const hasChildren = children.length > 0 && depth < maxDepth;
    const badgeKeys = badgesByCoach.get(c.id) || [];

    return (
      <div key={c.id} className="relative">
        <div className="flex items-start gap-2 py-1.5">
          <button
            type="button"
            onClick={() => hasChildren && toggle(c.id)}
            className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${hasChildren ? "bg-primary/20 text-primary hover:bg-primary/30" : "bg-white/10 text-white/40"}`}
            aria-label={isOpen ? "Recolher" : "Expandir"}
          >
            {hasChildren ? (isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : <Dot className="h-3 w-3" />}
          </button>
          <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">{c.profiles?.name || "Coach"}</p>
                <p className="text-[11px] text-white/45 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {directStudentCount(c.id)} alunos</span>
                  {childCoachCount(c.id) > 0 && <span>· {childCoachCount(c.id)} coaches</span>}
                </p>
              </div>
            </div>
            <Badges keys={badgeKeys} />
          </div>
        </div>
        {isOpen && hasChildren && (
          <div className="ml-6 border-l border-white/10 pl-3 space-y-1">
            {children.map((ch) => renderNode(ch, depth + 1, maxDepth))}
          </div>
        )}
      </div>
    );
  };

  // Direct children of "you"
  const myChildren = coach?.coachId ? coachesByUpline.get(coach.coachId) || [] : [];
  const myStudents = coach?.coachId
    ? (studentsByCoach.get(coach.coachId) || []).filter((s) => !coachProfileIds.has(s.profile_id))
    : [];
  const myBadges = coach?.coachId ? badgesByCoach.get(coach.coachId) || [] : [];
  const uplineBadges = upline ? badgesByCoach.get(upline.id) || [] : [];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Árvore da Rede</h1>
        <p className="text-sm text-white/50">Toque nos pontos para expandir até 3 níveis abaixo de cada coach</p>
      </div>

      <div className="rounded-2xl p-5 space-y-5" style={{ backgroundColor: "#1A1A1A" }}>
        {/* Upline */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-white/35">Acima de você</p>
          {upline ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{upline.profiles?.name || "Coach acima"}</p>
                  <p className="text-[11px] text-white/45">{upline.profiles?.email}</p>
                  <p className="text-[11px] text-white/55 mt-1 flex items-center gap-1">
                    <Users className="h-3 w-3" /> {directStudentCount(upline.id)} alunos diretos · {childCoachCount(upline.id)} coaches
                  </p>
                  <Badges keys={uplineBadges} />
                </div>
                <WhatsAppButton phone={upline.profiles?.phone} message={`Olá ${upline.profiles?.name || ""}!`} label="WhatsApp" />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-bold text-white">Sem coach acima</p>
              <p className="text-xs text-white/45">Você está no topo desta ramificação</p>
            </div>
          )}
        </div>

        {/* You */}
        <div className="pl-5 border-l-2 border-primary/40">
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
            <p className="text-sm font-bold text-white">{coach?.name || "Você"}</p>
            <p className="text-[11px] text-white/55">
              {coach?.referralCode || "—"} · {myStudents.length} alunos diretos · {myChildren.length} coaches
            </p>
            <Badges keys={myBadges} />
          </div>
        </div>

        {/* Downline tree (3 levels) */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-white/35">Abaixo de você</p>
          <div className="space-y-1">
            {myChildren.length === 0 && (
              <p className="text-sm text-white/50">Nenhum coach abaixo ainda.</p>
            )}
            {myChildren.map((c) => renderNode(c, 1, 3))}
          </div>
        </div>
      </div>
    </>
  );
}

export default NetworkTreeTab;
