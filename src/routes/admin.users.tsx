import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, ShieldCheck, ShieldOff, History, Settings2, Crown, MailCheck } from "lucide-react";
import { ADMIN_PERMISSIONS, type AdminPerms } from "@/lib/admin-permissions";
import { confirmUserEmailByProfileId } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Administradores — FitMind Club" }] }),
  component: AdminUsersPage,
});

interface ProfileRow {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string | null;
  is_master_admin?: boolean;
  admin_permissions?: AdminPerms | null;
}

interface AuditRow {
  id: string;
  action: string;
  before_role: string | null;
  after_role: string | null;
  before_permissions: any;
  after_permissions: any;
  created_at: string;
  actor_profile_id: string | null;
  target_profile_id: string | null;
}

function AdminUsersPage() {
  const confirmEmailFn = useServerFn(confirmUserEmailByProfileId);
  const [tab, setTab] = useState<"users" | "audit">("users");
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [me, setMe] = useState<ProfileRow | null>(null);
  const [editing, setEditing] = useState<ProfileRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: mine } = await supabase
        .from("profiles")
        .select("id, user_id, name, email, role, status, is_master_admin, admin_permissions")
        .eq("user_id", session.user.id)
        .maybeSingle();
      setMe(mine as any);
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, name, email, role, status, is_master_admin, admin_permissions")
      .order("role", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);
    if (error) toast.error("Erro ao carregar usuários: " + error.message);
    setProfiles((data || []) as any);

    const { data: a } = await supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setAudit((a || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const isMaster = !!me?.is_master_admin;

  const setRole = async (p: ProfileRow, makeAdmin: boolean) => {
    if (!isMaster) { toast.error("Apenas o admin máster pode alterar admins"); return; }
    setBusyId(p.id);
    const newRole = makeAdmin ? "admin" : "student";
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", p.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(makeAdmin ? "Promovido a admin" : "Permissão de admin removida");
    load();
  };

  const savePerms = async (p: ProfileRow, perms: AdminPerms) => {
    setBusyId(p.id);
    const { error } = await supabase.from("profiles").update({ admin_permissions: perms as any }).eq("id", p.id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Permissões atualizadas");
    setEditing(null);
    load();
  };

  const confirmEmail = async (p: ProfileRow) => {
    setBusyId(p.id);
    try {
      await confirmEmailFn({ data: { profileId: p.id } });
      toast.success("E-mail confirmado. O usuário já pode entrar.");
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível confirmar o e-mail.");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = profiles.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (p.name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
  });

  const admins = filtered.filter((p) => p.role === "admin");
  const others = filtered.filter((p) => p.role !== "admin");

  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const labelFor = (id: string | null) => {
    if (!id) return "Sistema";
    const p = profilesById.get(id);
    return p ? (p.name || p.email || id.slice(0, 8)) : id.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Administradores</h1>
        <p className="text-sm text-white/60">
          {isMaster
            ? "Você é o admin máster. Pode promover, revogar e definir permissões."
            : "Apenas o admin máster pode alterar permissões. Você pode visualizar."}
        </p>
      </div>

      <div className="flex gap-2 border-b border-white/5">
        <TabBtn active={tab === "users"} onClick={() => setTab("users")} icon={<ShieldCheck className="h-4 w-4" />}>Usuários</TabBtn>
        <TabBtn active={tab === "audit"} onClick={() => setTab("audit")} icon={<History className="h-4 w-4" />}>Auditoria</TabBtn>
      </div>

      {tab === "users" && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="text" placeholder="Buscar por nome ou e-mail..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-primary focus:outline-none"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <Section title={`Admins (${admins.length})`}>
                {admins.length === 0 ? <Empty text="Nenhum admin encontrado" /> : admins.map((p) => (
                  <Row key={p.id} profile={p} busy={busyId === p.id}
                    canManage={isMaster && !p.is_master_admin}
                    onToggle={() => setRole(p, false)}
                    onConfirmEmail={() => confirmEmail(p)}
                    onEditPerms={() => setEditing(p)}
                    isAdmin />
                ))}
              </Section>

              <Section title={`Outros usuários (${others.length})`}>
                {others.length === 0 ? <Empty text="Nenhum usuário encontrado" /> : others.slice(0, 100).map((p) => (
                  <Row key={p.id} profile={p} busy={busyId === p.id}
                    canManage={isMaster}
                    onConfirmEmail={() => confirmEmail(p)}
                    onToggle={() => setRole(p, true)} isAdmin={false} />
                ))}
                {others.length > 100 && (
                  <p className="px-4 py-2 text-xs text-white/40">Exibindo 100 primeiros. Refine a busca.</p>
                )}
              </Section>
            </>
          )}
        </>
      )}

      {tab === "audit" && (
        <Section title={`Histórico (${audit.length})`}>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : audit.length === 0 ? <Empty text="Nenhum registro ainda" /> : audit.map((row) => (
            <div key={row.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-white">{actionLabel(row.action)}</span>
                <span className="text-xs text-white/40">{new Date(row.created_at).toLocaleString("pt-BR")}</span>
              </div>
              <p className="text-xs text-white/60">
                <span className="text-white/80">{labelFor(row.actor_profile_id)}</span>
                {" → "}
                <span className="text-white/80">{labelFor(row.target_profile_id)}</span>
                {row.before_role && row.after_role && (
                  <span className="ml-2 text-white/40">({row.before_role} → {row.after_role})</span>
                )}
              </p>
            </div>
          ))}
        </Section>
      )}

      {editing && (
        <PermsModal
          profile={editing}
          onClose={() => setEditing(null)}
          onSave={(perms) => savePerms(editing, perms)}
          busy={busyId === editing.id}
        />
      )}
    </div>
  );
}

function actionLabel(a: string) {
  switch (a) {
    case "promote_admin": return "Promovido a admin";
    case "revoke_admin": return "Admin revogado";
    case "permissions_change": return "Permissões alteradas";
    case "role_change": return "Papel alterado";
    default: return a;
  }
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active ? "border-primary text-primary" : "border-transparent text-white/50 hover:text-white"
      }`}>
      {icon}{children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#111]">
      <div className="border-b border-white/5 px-4 py-3"><h2 className="text-sm font-semibold text-white">{title}</h2></div>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-sm text-white/40">{text}</p>;
}

function Row({
  profile, busy, onToggle, isAdmin, canManage, onConfirmEmail, onEditPerms,
}: { profile: ProfileRow; busy: boolean; onToggle: () => void; isAdmin: boolean; canManage: boolean; onConfirmEmail: () => void; onEditPerms?: () => void }) {
  const perms = (profile.admin_permissions || {}) as AdminPerms;
  const summary = profile.is_master_admin
    ? "Acesso total (máster)"
    : perms.full ? "Acesso total" :
      Object.keys(perms).filter((k) => perms[k]).length === 0 ? "Sem permissões" :
      `${Object.keys(perms).filter((k) => perms[k]).length} permissões`;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white flex items-center gap-1.5">
          {profile.is_master_admin && <Crown className="h-3.5 w-3.5 text-primary" />}
          {profile.name || "(sem nome)"}
        </p>
        <p className="truncate text-xs text-white/50">{profile.email}</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-white/30">
          {profile.role}{profile.status ? ` • ${profile.status}` : ""}{isAdmin ? ` • ${summary}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onConfirmEmail} disabled={!canManage || busy}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-40">
          <MailCheck className="h-3.5 w-3.5" /> Confirmar e-mail
        </button>
        {isAdmin && onEditPerms && !profile.is_master_admin && (
          <button onClick={onEditPerms} disabled={!canManage || busy}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-40">
            <Settings2 className="h-3.5 w-3.5" /> Permissões
          </button>
        )}
        {!profile.is_master_admin && (
          <button onClick={onToggle} disabled={!canManage || busy}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
              isAdmin
                ? "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
              isAdmin ? <><ShieldOff className="h-3.5 w-3.5" /> Revogar</> :
              <><ShieldCheck className="h-3.5 w-3.5" /> Promover</>}
          </button>
        )}
      </div>
    </div>
  );
}

function PermsModal({ profile, onClose, onSave, busy }: {
  profile: ProfileRow; onClose: () => void; onSave: (p: AdminPerms) => void; busy: boolean;
}) {
  const init = (profile.admin_permissions || {}) as AdminPerms;
  const [perms, setPerms] = useState<AdminPerms>({ ...init });
  const toggle = (k: string) => setPerms((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#111] p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white">Permissões de {profile.name}</h3>
        <p className="text-xs text-white/50 mb-4">Defina o que este admin pode acessar.</p>

        <label className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 mb-3 cursor-pointer">
          <input type="checkbox" checked={!!perms.full} onChange={() => toggle("full")} />
          <span className="text-sm font-semibold text-primary">Acesso total</span>
        </label>

        <div className={`grid grid-cols-2 gap-2 ${perms.full ? "opacity-40 pointer-events-none" : ""}`}>
          {ADMIN_PERMISSIONS.map((perm) => (
            <label key={perm.key} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={!!perms[perm.key]} onChange={() => toggle(perm.key)} />
              <span className="text-sm text-white">{perm.label}</span>
            </label>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-white/60 hover:text-white">Cancelar</button>
          <button onClick={() => onSave(perms)} disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
