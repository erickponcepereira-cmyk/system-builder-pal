import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FlaskConical, Loader2, Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getTestModeState, setTestMode } from "@/lib/test-mode.functions";
import { invalidateTestModeCache, useTestMode } from "@/lib/test-mode";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}

/** Card completo (toggle + estado) – usar em /admin/settings e /admin/financeiro */
export function TestModeCard() {
  const fetchState = useServerFn(getTestModeState);
  const apply = useServerFn(setTestMode);
  const [state, setState] = useState<{ enabled: boolean; cutoffAt: string | null; setAt: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const s = await fetchState();
      setState({ enabled: s.enabled, cutoffAt: s.cutoffAt, setAt: s.setAt });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (turnOn: boolean) => {
    const verb = turnOn ? "ATIVAR" : "DESATIVAR";
    if (!confirm(`${verb} o Modo de Testes?\n\n${turnOn ? "Vendas, faturas e lançamentos já existentes ficarão OCULTOS dos relatórios admin. Novos registros aparecem normalmente." : "Todos os registros antigos voltam a aparecer nos relatórios."}`)) return;
    setSaving(true);
    try {
      await apply({ data: { enabled: turnOn } });
      invalidateTestModeCache();
      toast.success(turnOn ? "Modo de Testes ATIVADO" : "Modo de Testes DESATIVADO");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally { setSaving(false); }
  };

  return (
    <div className={`rounded-2xl border p-5 ${state?.enabled ? "border-amber-500/40 bg-amber-500/5" : "border-white/5"}`} style={!state?.enabled ? { backgroundColor: "#1A1A1A" } : undefined}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-xl p-2 ${state?.enabled ? "bg-amber-500/15 text-amber-400" : "bg-white/5 text-white/60"}`}>
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-white">Modo de Testes</h3>
            <p className="text-sm text-white/55">Esconde temporariamente vendas/faturas/lançamentos anteriores ao marco. Ideal para validar fluxos com dados limpos sem apagar nada.</p>
            {state?.enabled && (
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex items-center gap-2 text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> Ativo desde {fmtDate(state.setAt)}</div>
                <div className="text-white/60">Marco de corte: <b className="text-white">{fmtDate(state.cutoffAt)}</b> — registros anteriores estão ocultos.</div>
              </div>
            )}
          </div>
        </div>
        <Button
          onClick={() => toggle(!state?.enabled)}
          disabled={loading || saving}
          variant={state?.enabled ? "destructive" : "default"}
          className="shrink-0"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}
          {state?.enabled ? "Desativar" : "Ativar"}
        </Button>
      </div>
    </div>
  );
}

/** Banner compacto exibido no topo de listagens quando o modo está ativo */
export function TestModeBanner({ hiddenLabel }: { hiddenLabel?: string }) {
  const { enabled, cutoffAt } = useTestMode();
  if (!enabled) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm">
      <FlaskConical className="h-4 w-4 text-amber-400 shrink-0" />
      <div className="text-amber-100">
        <b>Modo de Testes ATIVO.</b> {hiddenLabel ?? "Registros"} anteriores a <b>{fmtDate(cutoffAt)}</b> estão ocultos. Desative em <i>Admin &gt; Configurações</i> ou <i>Admin &gt; Financeiro</i> para voltar ao normal.
      </div>
    </div>
  );
}
