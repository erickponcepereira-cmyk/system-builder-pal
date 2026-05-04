import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, ShieldCheck, ShieldOff } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [{ title: "Administradores — FitMind Club" }],
  }),
  component: AdminUsersPage,
});

interface ProfileRow {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string | null;
}

function AdminUsersPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, name, email, role, status")
      .order("role", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);
    if (error) toast.error("Erro ao carregar usuários: " + error.message);
    setProfiles((data || []) as ProfileRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setRole = async (p: ProfileRow, makeAdmin: boolean) => {
    setBusyId(p.id);
    const newRole = makeAdmin ? "admin" : "student";
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", p.id);
    setBusyId(null);
    if (error) {
      toast.error("Falha ao atualizar: " + error.message);
      return;
    }
    toast.success(makeAdmin ? "Promovido a admin" : "Permissão de admin removida");
    load();
  };

  const filtered = profiles.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.name || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q)
    );
  });

  const admins = filtered.filter((p) => p.role === "admin");
  const others = filtered.filter((p) => p.role !== "admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Administradores</h1>
        <p className="text-sm text-white/60">
          Promova ou revogue permissões de administrador. Apenas admins podem acessar este painel.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <input
          type="text"
          placeholder="Buscar por nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Section title={`Admins (${admins.length})`}>
            {admins.length === 0 ? (
              <Empty text="Nenhum admin encontrado" />
            ) : admins.map((p) => (
              <Row
                key={p.id}
                profile={p}
                busy={busyId === p.id}
                onToggle={() => setRole(p, false)}
                isAdmin
              />
            ))}
          </Section>

          <Section title={`Outros usuários (${others.length})`}>
            {others.length === 0 ? (
              <Empty text="Nenhum usuário encontrado" />
            ) : others.slice(0, 100).map((p) => (
              <Row
                key={p.id}
                profile={p}
                busy={busyId === p.id}
                onToggle={() => setRole(p, true)}
                isAdmin={false}
              />
            ))}
            {others.length > 100 && (
              <p className="px-4 py-2 text-xs text-white/40">
                Exibindo 100 primeiros. Refine a busca para encontrar outros.
              </p>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#111]">
      <div className="border-b border-white/5 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-sm text-white/40">{text}</p>;
}

function Row({
  profile, busy, onToggle, isAdmin,
}: { profile: ProfileRow; busy: boolean; onToggle: () => void; isAdmin: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{profile.name || "(sem nome)"}</p>
        <p className="truncate text-xs text-white/50">{profile.email}</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-white/30">
          {profile.role} {profile.status ? `• ${profile.status}` : ""}
        </p>
      </div>
      <button
        onClick={onToggle}
        disabled={busy}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          isAdmin
            ? "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
            : "bg-primary text-primary-foreground hover:opacity-90"
        }`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isAdmin ? (
          <><ShieldOff className="h-3.5 w-3.5" /> Remover admin</>
        ) : (
          <><ShieldCheck className="h-3.5 w-3.5" /> Promover a admin</>
        )}
      </button>
    </div>
  );
}
