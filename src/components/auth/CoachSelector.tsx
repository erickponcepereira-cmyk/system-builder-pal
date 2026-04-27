import { useEffect, useMemo, useState } from "react";
import { Search, UserCheck } from "lucide-react";
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

export function CoachSelector({ value, onChange, label = "Coach indicador *" }: CoachSelectorProps) {
  const [query, setQuery] = useState("");
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [loading, setLoading] = useState(false);

  const normalizedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        let request = supabase
          .from("coaches")
          .select("id, profile_id, profiles!inner(name, city, state)")
          .not("approved_at", "is", null)
          .limit(8);

        if (normalizedQuery) {
          request = request.ilike("profiles.name", `%${normalizedQuery}%`);
        }

        const { data } = await request;
        const rows = ((data || []) as Array<{
          id: string;
          profile_id: string;
          profiles?: { name?: string | null; city?: string | null; state?: string | null } | null;
        }>).map((row) => ({
          id: row.id,
          profileId: row.profile_id,
          name: row.profiles?.name || "Coach sem nome",
          city: row.profiles?.city,
          state: row.profiles?.state,
        }));
        setCoaches(rows);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(handle);
  }, [normalizedQuery]);

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

      {value && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
          <UserCheck className="h-4 w-4" />
          <span className="font-semibold">Selecionado: {value.name}</span>
        </div>
      )}

      <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-2">
        {loading ? (
          <p className="px-2 py-3 text-xs text-white/40">Buscando coaches...</p>
        ) : coaches.length === 0 ? (
          <p className="px-2 py-3 text-xs text-white/40">Nenhum coach aprovado encontrado.</p>
        ) : (
          coaches.map((coach) => (
            <button
              key={coach.id}
              type="button"
              onClick={() => onChange(coach)}
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
