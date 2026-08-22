import { RefreshCw } from "lucide-react";

export type RecurrenceValue = {
  is_recurring?: boolean | null;
  recurrence_interval?: string | null;
  recurrence_amount?: number | null;
  recurrence_trial_days?: number | null;
  recurrence_allow_one_time?: boolean | null;
};

interface Props {
  value: RecurrenceValue;
  price?: number | null;
  onChange: (patch: RecurrenceValue) => void;
}

/**
 * Normaliza os campos de recorrência antes de salvar.
 * Se o produto NÃO é assinatura, todos os campos ficam limpos — nada de
 * resíduo capaz de transformar uma venda avulsa em cobrança recorrente.
 */
export function normalizeRecurrence(value: RecurrenceValue, price?: number | null): Required<RecurrenceValue> {
  if (!value?.is_recurring) {
    return {
      is_recurring: false,
      recurrence_interval: "monthly",
      recurrence_amount: null,
      recurrence_trial_days: 0,
      recurrence_allow_one_time: true,
    };
  }
  return {
    is_recurring: true,
    recurrence_interval: value.recurrence_interval === "yearly" ? "yearly" : "monthly",
    recurrence_amount: Number(value.recurrence_amount ?? price ?? 0) || 0,
    recurrence_trial_days: Math.max(0, Number(value.recurrence_trial_days || 0)),
    recurrence_allow_one_time: value.recurrence_allow_one_time !== false,
  };
}

/** Etiqueta curta para as listas de produtos. */
export function recurrenceLabel(value: RecurrenceValue): string | null {
  if (!value?.is_recurring) return null;
  return value.recurrence_interval === "yearly" ? "Assinatura anual" : "Assinatura mensal";
}

/**
 * Bloco reutilizável de configuração de cobrança recorrente (assinatura).
 * Usado no cadastro de produtos do admin, do parceiro e do profissional.
 */
export function RecurrenceFields({ value, price, onChange }: Props) {
  const on = !!value.is_recurring;
  const interval = value.recurrence_interval || "monthly";

  return (
    <div className="md:col-span-2 rounded-lg border border-white/10 bg-white/5 p-3">
      <label className="flex items-center gap-2 text-sm font-semibold text-white/90">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            e.target.checked
              ? onChange({
                  is_recurring: true,
                  recurrence_interval: value.recurrence_interval || "monthly",
                  recurrence_amount: value.recurrence_amount ?? (price ? Number(price) : null),
                  recurrence_trial_days: value.recurrence_trial_days ?? 0,
                  recurrence_allow_one_time: value.recurrence_allow_one_time ?? true,
                })
              : onChange(normalizeRecurrence({ is_recurring: false }))
          }
        />
        <RefreshCw className="h-3.5 w-3.5 text-primary" />
        Este produto é uma assinatura / cobrança recorrente
      </label>

      {on && (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs text-white/60 mb-1 block">Intervalo</label>
            <select
              className="input-dark w-full"
              value={interval}
              onChange={(e) => onChange({ recurrence_interval: e.target.value })}
            >
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-white/60 mb-1 block">Valor de cada cobrança (R$)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              className="input-dark w-full"
              value={value.recurrence_amount ?? ""}
              placeholder={price ? String(price) : "0,00"}
              onChange={(e) => onChange({ recurrence_amount: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div>
            <label className="text-xs text-white/60 mb-1 block">Dias de teste grátis</label>
            <input
              type="number"
              min={0}
              max={90}
              className="input-dark w-full"
              value={value.recurrence_trial_days ?? 0}
              onChange={(e) => onChange({ recurrence_trial_days: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>

          <label className="md:col-span-3 flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={value.recurrence_allow_one_time ?? true}
              onChange={(e) => onChange({ recurrence_allow_one_time: e.target.checked })}
            />
            Permitir também pagamento avulso (PIX ou cartão sem salvar)
          </label>

          <p className="md:col-span-3 text-[11px] text-white/40">
            No checkout o cliente escolhe entre <strong>Assinar</strong> (cartão salvo, cobrança automática) e{" "}
            <strong>Pagar só desta vez</strong>. Se desmarcar a opção acima, só a assinatura fica disponível.
          </p>
        </div>
      )}
    </div>
  );
}
