import { CalendarDays, CalendarRange } from "lucide-react";

/**
 * Tags de limite de resgate de um benefício gratuito.
 * Com dados de uso, mostra "1/2 por semana" · "2/8 por mês".
 * Sem dados de uso, mantém "2x por semana" · "8x por mês".
 */
export function FreebieLimitTags({
  weekly,
  monthly,
  usedWeekly,
  usedMonthly,
  compact = false,
}: {
  weekly?: number | null;
  monthly?: number | null;
  usedWeekly?: number | null;
  usedMonthly?: number | null;
  compact?: boolean;
}) {
  const size = compact ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-1";
  const icon = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  const w = weekly && weekly > 0 ? weekly : null;
  const m = monthly && monthly > 0 ? monthly : null;
  if (!w && !m) return null;

  const uw = typeof usedWeekly === "number" ? Math.max(0, usedWeekly) : null;
  const um = typeof usedMonthly === "number" ? Math.max(0, usedMonthly) : null;

  const weekFull = uw !== null && w !== null && uw >= w;
  const monthFull = um !== null && m !== null && um >= m;

  const base = "inline-flex items-center gap-1 rounded-md font-bold";
  const weekClass = weekFull
    ? "bg-red-500/15 text-red-400"
    : "bg-primary/15 text-primary";
  const monthClass = monthFull
    ? "bg-red-500/15 text-red-400"
    : "bg-sky-500/15 text-sky-400";

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {w && (
        <span className={`${base} ${size} ${weekClass}`} title={weekFull ? "Limite semanal atingido" : undefined}>
          <CalendarDays className={icon} />
          {uw !== null ? `${uw}/${w} por semana` : `${w}x por semana`}
        </span>
      )}
      {m && (
        <span className={`${base} ${size} ${monthClass}`} title={monthFull ? "Limite mensal atingido" : undefined}>
          <CalendarRange className={icon} />
          {um !== null ? `${um}/${m} por mês` : `${m}x por mês`}
        </span>
      )}
    </div>
  );
}
