import { useEffect, useMemo, useState } from "react";
import { Cake, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Person = {
  id: string;
  name: string | null;
  birthdate: string | null;
  avatar_url?: string | null;
  role?: string | null;
  coachName?: string | null;
};

type Scope = "coach-month" | "week" | "admin-global";

interface Props {
  scope: Scope;
  /** For coach-month: limit to students of this coach */
  coachId?: string;
  title?: string;
}

function parseBd(b: string | null) {
  if (!b) return null;
  const d = new Date(b);
  if (isNaN(d.getTime())) return null;
  return d;
}

function daysUntilBirthday(bd: Date, today = new Date()) {
  const y = today.getFullYear();
  let next = new Date(y, bd.getMonth(), bd.getDate());
  if (next < new Date(y, today.getMonth(), today.getDate())) {
    next = new Date(y + 1, bd.getMonth(), bd.getDate());
  }
  const ms = next.getTime() - new Date(y, today.getMonth(), today.getDate()).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function ageOn(bd: Date, when: Date) {
  let a = when.getFullYear() - bd.getFullYear();
  const m = when.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && when.getDate() < bd.getDate())) a--;
  return a;
}

export function BirthdaysCard({ scope, coachId, title }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let list: Person[] = [];
        if (scope === "coach-month" && coachId) {
          const { data: students } = await supabase
            .from("students")
            .select("profile_id")
            .eq("coach_id", coachId);
          const ids = (students || []).map((s) => s.profile_id);
          if (ids.length === 0) {
            list = [];
          } else {
            const { data } = await supabase
              .from("profiles")
              .select("id,name,birthdate,avatar_url,role")
              .in("id", ids);
            list = (data as Person[]) || [];
          }
        } else {
          const { data } = await supabase
            .from("profiles")
            .select("id,name,birthdate,avatar_url,role")
            .not("birthdate", "is", null);
          list = (data as Person[]) || [];
        }

        // Enriquecer com nome do coach vinculado quando houver registro de aluno
        if (list.length) {
          const profileIds = list.map((p) => p.id);
          const { data: stu } = await supabase
            .from("students")
            .select("profile_id,coach:coaches!students_coach_id_fkey(profiles:profile_id(name))")
            .in("profile_id", profileIds);
          const map = new Map<string, string | null>();
          ((stu || []) as any[]).forEach((r) => map.set(r.profile_id, r.coach?.profiles?.name || null));
          list = list.map((p) => ({ ...p, coachName: map.get(p.id) || null }));
        }
        setPeople(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [scope, coachId]);

  const items = useMemo(() => {
    const today = new Date();
    const list = people
      .map((p) => {
        const bd = parseBd(p.birthdate);
        if (!bd) return null;
        const days = daysUntilBirthday(bd, today);
        const age = ageOn(bd, today) + (days === 0 ? 0 : 0);
        return { ...p, bd, days, age };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    if (scope === "week") return list.filter((x) => x.days <= 7).sort((a, b) => a.days - b.days);
    if (scope === "coach-month") {
      return list
        .filter((x) => x.bd.getMonth() === today.getMonth())
        .sort((a, b) => a.bd.getDate() - b.bd.getDate());
    }
    // admin-global: priorizar semana, depois mês
    const weekFirst = list.filter((x) => x.days <= 7);
    const monthOnly = list.filter((x) => x.days > 7 && x.bd.getMonth() === today.getMonth());
    return [...weekFirst.sort((a, b) => a.days - b.days), ...monthOnly.sort((a, b) => a.bd.getDate() - b.bd.getDate())];
  }, [people, scope]);

  const heading =
    title ??
    (scope === "week"
      ? "Aniversariantes da semana"
      : scope === "coach-month"
        ? "Aniversariantes do mês"
        : "Aniversariantes — prioridade semana");

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cake className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold text-foreground">{heading}</h3>
        </div>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum aniversariante {scope === "week" ? "nesta semana" : "neste período"}.</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 12).map((p) => {
            const dateStr = p.bd.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
            const isToday = p.days === 0;
            const isWeek = p.days <= 7;
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 rounded-xl border p-2.5 ${
                  isToday
                    ? "border-primary/60 bg-primary/10"
                    : isWeek
                      ? "border-primary/30 bg-muted/40"
                      : "border-border bg-muted/20"
                }`}
              >
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                    {(p.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{p.name || "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {dateStr} · {p.age + (p.days === 0 ? 0 : 1)} anos
                    {p.role ? ` · ${p.role}` : ""}
                  </p>
                </div>
                {isToday ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                    <PartyPopper className="h-3 w-3" /> Hoje!
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-primary">
                    {p.days === 1 ? "amanhã" : `em ${p.days}d`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
