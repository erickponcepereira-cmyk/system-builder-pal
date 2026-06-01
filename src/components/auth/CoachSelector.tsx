import { useEffect, useMemo, useState } from "react";
import { Search, UserCheck, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type CoachOption = {
  id: string;
  profileId: string;
  name: string;
  city?: string | null;
  state?: string | null;
};

interface CoachSelectorProps {
  value: CoachOption | null;
  onChange: (coach: CoachOption | null) => void;
  label?: string;
}

const MASTER_COACH: CoachOption = {
  id: "75e5ab7a-2088-43fe-9510-a025ada25a30",
  profileId: "9d2c0d78-f523-494e-847b-ead8631e2a9e",
  name: "Master",
  city: "Brasil",
  state: "BR",
};

export function CoachSelector({ value, onChange, label = "Coach indicador *" }: CoachSelectorProps) {
  const [query, setQuery] = useState("");
  const [coaches, setCoaches] = useState<CoachOption[]>([MASTER_COACH]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const normalizedQuery = useMemo(() => query.trim(), [query]);

  // Quando seleciona um coach, recolhe a lista
  useEffect(() => {
    if (value) setExpanded(false);
  }, [value]);

  useEffect(() => {
    if (!expanded) return;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        let request = supabase
          .from("coaches")
          .select("id, profile_id, profiles!inner(name, city, state)")
          .not("approved_at", "is", null)
          .limit(200);

        if (normalizedQuery) {
          request = request.ilike("profiles.name", `%${normalizedQuery}%`);
        }

        const { data } = await request;
        const rows = ((data || []) as Array<{
          id: string;
          profile_id: string;
          profiles?: { name?: string | null; city?: string | null; state?: string | null } | null;
        }>)
          .filter((row) => row.profiles?.name)
          .map((row) => ({
            id: row.id,
            profileId: row.profile_id,
            name: row.profiles?.name || "Coach sem nome",
            city: row.profiles?.city,
            state: row.profiles?.state,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        const shouldShowMaster = !normalizedQuery || "master".includes(normalizedQuery.toLowerCase());
        const mergedRows = shouldShowMaster && !rows.some((coach) => coach.id === MASTER_COACH.id)
          ? [MASTER_COACH, ...rows]
          : rows;
        setCoaches(mergedRows);

      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(handle);
  }, [normalizedQuery, expanded]);

  // Estado recolhido: mostra o coach selecionado com botão para alterar
  if (value && !expanded) {
    return (
      <div className="space-y-2">
        <Label className="text-white/70">{label}</Label>
        <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-white">{value.name}</span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20"
          >
            <Pencil className="h-3 w-3" /> Alterar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-white/70">{label}</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar coach pelo nome"
          className="bg-white/5 border-white/10 pl-9 text-white placeholder:text-white/30"
        />
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-2">
        {loading ? (
          <p className="px-2 py-3 text-xs text-white/40">Buscando coaches...</p>
        ) : coaches.length === 0 ? (
          <p className="px-2 py-3 text-xs text-white/40">Nenhum coach aprovado encontrado.</p>
        ) : (
          coaches.map((coach) => (
            <button
              key={coach.id}
              type="button"
              onClick={() => {
                onChange(coach);
                setExpanded(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors",
                value?.id === coach.id ? "bg-primary text-primary-foreground" : "hover:bg-white/5"
              )}
            >
              <span className="text-sm font-medium text-current">{coach.name}</span>
              <span className="text-[10px] opacity-70">
                {[coach.city, coach.state].filter(Boolean).join("/") || "Aprovado"}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
