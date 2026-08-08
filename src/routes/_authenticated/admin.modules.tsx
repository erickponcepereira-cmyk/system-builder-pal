import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Blocks, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MODULE_LABELS, type ModuleKey } from "@/lib/use-modules";
import {
  listModuleSettings,
  removeModuleSetting,
  searchModuleTargets,
  setModuleSetting,
  type ModuleSetting,
  type ModuleTarget,
} from "@/lib/admin-modules.functions";

export const Route = createFileRoute("/_authenticated/admin/modules")({
  head: () => ({
    meta: [
      { title: "Módulos por rede — Admin FitMind Club" },
      { name: "description", content: "Ative módulos como Corrida por coach, parceiro ou para todo o sistema." },
    ],
  }),
  component: AdminModules,
});

const MODULE_KEYS = Object.keys(MODULE_LABELS) as ModuleKey[];

function AdminModules() {
  const fetchSettings = useServerFn(listModuleSettings);
  const saveSetting = useServerFn(setModuleSetting);
  const deleteSetting = useServerFn(removeModuleSetting);
  const searchTargets = useServerFn(searchModuleTargets);

  const [settings, setSettings] = useState<ModuleSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<ModuleTarget[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSettings();
      setSettings(res.settings as ModuleSetting[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar módulos");
    } finally {
      setLoading(false);
    }
  }, [fetchSettings]);

  useEffect(() => { load(); }, [load]);

  const globals = settings.filter((s) => s.scope_type === "global");
  const specifics = settings.filter((s) => s.scope_type !== "global");

  const toggle = async (
    scope_type: ModuleSetting["scope_type"],
    scope_id: string | null,
    module_key: string,
    enabled: boolean,
  ) => {
    const tag = `${scope_type}:${scope_id}:${module_key}`;
    setBusy(tag);
    try {
      await saveSetting({ data: { scope_type, scope_id, module_key, enabled } });
      toast.success(enabled ? "Módulo liberado" : "Módulo bloqueado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta regra? O alvo passa a herdar a configuração superior.")) return;
    setBusy(id);
    try {
      await deleteSetting({ data: { id } });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover");
    } finally {
      setBusy(null);
    }
  };

  const runSearch = async () => {
    if (!query.trim()) return setTargets([]);
    setSearching(true);
    try {
      const res = await searchTargets({ data: { q: query } });
      setTargets(res.targets as ModuleTarget[]);
      if (res.targets.length === 0) toast.info("Nenhum coach ou parceiro encontrado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na busca");
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-10">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Personalização</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Blocks className="h-6 w-6 text-primary" /> Módulos por rede
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          A liberação segue a ordem: perfil → coach/parceiro → rede (upline) → padrão do sistema.
        </p>
      </header>

      <section className="rounded-2xl bg-card p-4">
        <h2 className="text-sm font-bold text-foreground">Padrão do sistema</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">Vale para quem não tiver regra específica.</p>
        <div className="space-y-2">
          {MODULE_KEYS.map((key) => {
            const row = globals.find((g) => g.module_key === key);
            const enabled = row?.enabled ?? false;
            const tag = `global:null:${key}`;
            return (
              <div key={key} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5">
                <span className="text-sm font-semibold text-foreground">{MODULE_LABELS[key]}</span>
                <button
                  onClick={() => toggle("global", null, key, !enabled)}
                  disabled={busy === tag}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${enabled ? "bg-primary text-primary-foreground" : "bg-white/10 text-muted-foreground"}`}
                >
                  {busy === tag ? "..." : enabled ? "Liberado" : "Bloqueado"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl bg-card p-4">
        <h2 className="text-sm font-bold text-foreground">Liberar para um coach ou parceiro</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          A rede abaixo do coach herda automaticamente a liberação.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Nome ou e-mail"
              className="field-control w-full pl-9"
            />
          </div>
          <button onClick={runSearch} disabled={searching} className="rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
          </button>
        </div>

        {targets.length > 0 && (
          <div className="mt-3 space-y-2">
            {targets.map((t) => (
              <div key={`${t.kind}-${t.id}`} className="rounded-xl bg-white/[0.03] p-3">
                <p className="text-sm font-semibold text-foreground">
                  {t.name} <span className="text-[10px] uppercase text-muted-foreground">({t.kind === "coach" ? "coach" : "parceiro"})</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{t.email}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MODULE_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={() => toggle(t.kind, t.id, key, true)}
                      className="rounded-lg bg-primary/15 px-2.5 py-1.5 text-[11px] font-semibold text-primary"
                    >
                      Liberar {MODULE_LABELS[key]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4">
        <h2 className="mb-3 text-sm font-bold text-foreground">Regras específicas ({specifics.length})</h2>
        {specifics.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma regra específica cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {specifics.map((row) => (
              <div key={row.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{row.scope_label || row.scope_id}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.scope_type} · {MODULE_LABELS[row.module_key as ModuleKey] || row.module_key}
                  </p>
                </div>
                <button
                  onClick={() => toggle(row.scope_type, row.scope_id, row.module_key, !row.enabled)}
                  disabled={busy !== null}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${row.enabled ? "bg-primary text-primary-foreground" : "bg-white/10 text-muted-foreground"}`}
                >
                  {row.enabled ? "Liberado" : "Bloqueado"}
                </button>
                <button onClick={() => remove(row.id)} disabled={busy !== null} className="rounded-lg bg-destructive/10 p-2 text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
