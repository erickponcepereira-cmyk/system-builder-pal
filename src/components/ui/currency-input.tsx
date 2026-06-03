import { forwardRef } from "react";

/** Formata centavos -> "1.234,56" (sem prefixo). */
export function formatCentsBRL(cents: number): string {
  const n = Math.max(0, Math.round(cents)) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Lê string formatada/livre e devolve centavos. */
export function parseToCents(raw: string): number {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10);
}

type Props = {
  /** Valor em REAIS (não centavos). */
  value: number;
  onChange: (reais: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};

/**
 * Input de moeda BRL: digita só números, formata como "1.234,56" e
 * devolve o valor em reais (float). Sempre mostra "R$" como prefixo.
 */
export const CurrencyInputBRL = forwardRef<HTMLInputElement, Props>(function CurrencyInputBRL(
  { value, onChange, placeholder = "0,00", className = "", disabled, id },
  ref,
) {
  const cents = Math.round((Number(value) || 0) * 100);
  const display = cents > 0 ? formatCentsBRL(cents) : "";
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white/60">
        R$
      </span>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={display}
        placeholder={placeholder}
        onChange={(e) => {
          const c = parseToCents(e.target.value);
          onChange(c / 100);
        }}
        className="field-input pl-10"
      />
    </div>
  );
});
