import { CalendarDays, CalendarRange } from "lucide-react";

/** Tags de limite de resgate ("2x por semana", "4x por mês") de um benefício gratuito. */
export function FreebieLimitTags({
  weekly,
  monthly,
  compact = false,
}: {
  weekly?: number | null;
  monthly?: number | null;
  compact?: boolean;
}) {
  const size = compact ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-1";
  const w = weekly && weekly > 0 ? weekly : null;
  const m = monthly && monthly > 0 ? monthly : null;
  if (!w && !m) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {w && (
        <span className={`inline-flex items-center gap-1 rounded-md bg-primary/15 ${size} font-bold text-primary`}>
          <CalendarDays className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} /> {w}x por semana
        </span>
      )}
      {m && (
        <span className={`inline-flex items-center gap-1 rounded-md bg-sky-500/15 ${size} font-bold text-sky-400`}>
          <CalendarRange className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} /> {m}x por mês
        </span>
      )}
    </div>
  );
}
