// ══════════════════════════════════════════════════════════════════════════════
// Timezone helpers — fuso de Cuiabá, MT, Brasil (UTC-4, sem horário de verão)
// ══════════════════════════════════════════════════════════════════════════════

export const TZ = "America/Cuiaba";
export const TZ_OFFSET = "-04:00";

const pad = (n: number) => String(n).padStart(2, "0");

/** Retorna "YYYY-MM-DD" para uma Date (ou ISO string) no fuso de Cuiabá. */
export function tzDateKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Retorna "YYYY-MM-DDTHH:MM" no fuso de Cuiabá (para inputs datetime-local). */
export function tzDateTimeLocal(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** Hoje em Cuiabá como "YYYY-MM-DD". */
export function tzToday(): string {
  return tzDateKey(new Date());
}

/** Ano e mês (0-indexed) atuais em Cuiabá. */
export function tzCurrentYearMonth(): { year: number; month: number } {
  const [y, m] = tzToday().split("-").map(Number);
  return { year: y, month: m - 1 };
}

/** Constrói chave "YYYY-MM-DD" a partir de componentes. */
export function ymdKey(year: number, month0: number, day: number): string {
  return `${year}-${pad(month0 + 1)}-${pad(day)}`;
}

/** Converte "YYYY-MM-DDTHH:MM" (entendido como hora de Cuiabá) → ISO UTC. */
export function tzLocalToISO(localStr: string): string {
  const s = localStr.length === 16 ? `${localStr}:00` : localStr;
  return new Date(`${s}${TZ_OFFSET}`).toISOString();
}

/** Início do dia em Cuiabá como Date (instante UTC). */
export function tzStartOfDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00${TZ_OFFSET}`);
}

/** Início do mês "YYYY-MM" em Cuiabá como Date (instante UTC). */
export function tzStartOfMonth(yearMonth: string): Date {
  return new Date(`${yearMonth}-01T00:00:00${TZ_OFFSET}`);
}

/** Soma `delta` meses a "YYYY-MM". */
export function shiftYearMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12;
  return `${ny}-${pad(nm + 1)}`;
}

/** Rótulo em pt-BR para "YYYY-MM" (ex: "maio de 2026"). */
export function yearMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
