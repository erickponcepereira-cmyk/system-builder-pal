import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Percent } from "lucide-react";
import { toast } from "sonner";
import {
  getMyMasterCoachCommissionPct,
  updateMyMasterCoachCommissionPct,
} from "@/lib/master-commission.functions";

const OPTIONS = [10, 20, 30, 40, 50, 60, 70];

/**
 * Seletor da Comissão do Master Coach (10%–70%) para o coach logado.
 * O valor escolhido é aplicado automaticamente quando o Master Coach
 * vender para os alunos deste coach (substitui o padrão de 10%).
 */
export function MasterCoachCommissionSelector() {
  const fetchPct = useServerFn(getMyMasterCoachCommissionPct);
  const updatePct = useServerFn(updateMyMasterCoachCommissionPct);
  const [pct, setPct] = useState<number>(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await fetchPct();
        setPct(Number(v) || 10);
      } catch {
        /* keep default */
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = async (next: number) => {
    if (next === pct) return;
    setSaving(true);
    const prev = pct;
    setPct(next);
    try {
      await updatePct({ data: { pct: next } });
      toast.success(`Comissão Master Coach: ${next}%`);
    } catch (e: any) {
      setPct(prev);
      toast.error(e?.message || "Erro ao atualizar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2">
      <Percent className="h-4 w-4 text-primary shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-primary leading-tight">
          Comissão Master Coach
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          Aplicada nas vendas para seus alunos
        </p>
      </div>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : (
        <select
          value={pct}
          disabled={saving}
          onChange={(e) => onChange(Number(e.target.value))}
          className="ml-1 rounded-lg bg-card border border-white/10 px-2 py-1 text-xs font-bold text-foreground disabled:opacity-60"
        >
          {OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v}%{v === 10 ? " (padrão)" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export default MasterCoachCommissionSelector;
