// Modal com as 14 declarações obrigatórias antes de entrar em um desafio (ticket).
// Bloqueia o "Quero entrar" até que TODAS as caixas estejam marcadas.

import { useState } from "react";
import { AlertTriangle, Loader2, Trophy, X } from "lucide-react";
import { CHALLENGE_ACCEPTANCE_DECLARATIONS } from "@/lib/terms";

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  loading?: boolean;
  competitionLabel?: string;
  turmaNumber?: number;
}

export function ChallengeTicketAcceptModal({
  open,
  onCancel,
  onConfirm,
  loading,
  competitionLabel,
  turmaNumber,
}: Props) {
  const [checks, setChecks] = useState<boolean[]>(
    () => CHALLENGE_ACCEPTANCE_DECLARATIONS.map(() => false),
  );

  if (!open) return null;

  const allChecked = checks.every(Boolean);
  const checkedCount = checks.filter(Boolean).length;

  const toggle = (idx: number) =>
    setChecks((prev) => prev.map((v, i) => (i === idx ? !v : v)));

  const toggleAll = () =>
    setChecks((prev) => {
      const next = !prev.every(Boolean);
      return prev.map(() => next);
    });


  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">
              Termo de participação — Desafio FitMind
            </h2>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          {(competitionLabel || turmaNumber) && (
            <p className="mb-3 text-xs text-muted-foreground">
              Você está confirmando entrada em{" "}
              <span className="font-bold text-foreground">
                {competitionLabel ? `desafio ${competitionLabel}` : "desafio"}
                {turmaNumber ? ` — Turma ${turmaNumber}` : ""}
              </span>
              . Para concluir, é necessário marcar todas as declarações abaixo.
            </p>
          )}

          <ul className="space-y-2.5">
            {CHALLENGE_ACCEPTANCE_DECLARATIONS.map((text, idx) => (
              <li key={idx}>
                <label className="flex cursor-pointer gap-2 rounded-lg border border-border/60 bg-background/40 p-2.5 text-[13px] leading-relaxed text-foreground/90 hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary"
                    checked={checks[idx]}
                    onChange={() => toggle(idx)}
                    disabled={loading}
                  />
                  <span>{text}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-muted/20 px-5 py-3">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {checkedCount} de {CHALLENGE_ACCEPTANCE_DECLARATIONS.length} declarações
            </span>
            {allChecked && (
              <span className="font-medium text-primary">Tudo pronto ✓</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-lg bg-muted py-2 text-sm font-bold text-muted-foreground disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm()}
              disabled={!allChecked || loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trophy className="h-4 w-4" />
              )}
              Aceito e quero entrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
