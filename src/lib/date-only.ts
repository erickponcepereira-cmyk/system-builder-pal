/**
 * Utilities for "date-only" values (birthdates, due dates) stored as
 * `YYYY-MM-DD` (Postgres `date`) or typed as `DD/MM/YYYY`.
 *
 * IMPORTANT: `new Date("1995-07-30")` is parsed by JS as UTC midnight, which in
 * Brazil (UTC-3) renders as 29/07 — an off-by-one day. Always parse these
 * values with `parseDateOnly`, which builds a Date at LOCAL midnight.
 */

/** Parse `YYYY-MM-DD` (with optional time) or `DD/MM/YYYY` into a local-midnight Date. */
export function parseDateOnly(input: string | null | undefined): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  let year: number, month: number, day: number;

  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dmy) {
    day = parseInt(dmy[1], 10);
    month = parseInt(dmy[2], 10);
    year = parseInt(dmy[3], 10);
    if (year < 100) year += year >= 30 ? 1900 : 2000;
  } else if (iso) {
    year = parseInt(iso[1], 10);
    month = parseInt(iso[2], 10);
    day = parseInt(iso[3], 10);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/** `dd/mm/aaaa` without timezone drift. */
export function formatDateOnlyBR(
  input: string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = parseDateOnly(input);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", opts ?? { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Today at local midnight. */
export function todayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** Completed age today (or on a reference date), local calendar. */
export function calcAgeFromDateOnly(
  input: string | null | undefined,
  reference?: Date | string | null,
): number | null {
  const b = parseDateOnly(input);
  if (!b) return null;
  const ref =
    typeof reference === "string" ? (parseDateOnly(reference) ?? todayLocal()) : (reference ?? todayLocal());
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** Days until the next birthday (0 = today), local calendar. */
export function daysUntilBirthday(input: string | Date | null | undefined, today = todayLocal()): number | null {
  const b = input instanceof Date ? input : parseDateOnly(input);
  if (!b) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(base.getFullYear(), b.getMonth(), b.getDate());
  if (next < base) next = new Date(base.getFullYear() + 1, b.getMonth(), b.getDate());
  return Math.round((next.getTime() - base.getTime()) / 86400000);
}

/** Age the person turns on their next birthday. */
export function ageOnNextBirthday(input: string | Date | null | undefined, today = todayLocal()): number | null {
  const b = input instanceof Date ? input : parseDateOnly(input);
  if (!b) return null;
  const days = daysUntilBirthday(b, today);
  if (days == null) return null;
  const nextYear = days === 0 ? today.getFullYear() : new Date(today.getFullYear(), b.getMonth(), b.getDate()) < today ? today.getFullYear() + 1 : today.getFullYear();
  return nextYear - b.getFullYear();
}

/** Today as `YYYY-MM-DD` using the LOCAL calendar (never UTC). */
export function todayISOLocal(d: Date = new Date()): string {
  return toISODateLocal(d);
}

/** Convert a Date to `YYYY-MM-DD` using the LOCAL calendar. */
export function toISODateLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Shift a `YYYY-MM-DD` value by N days without timezone drift. */
export function addDaysISO(iso: string, days: number): string {
  const d = parseDateOnly(iso) ?? todayLocal();
  d.setDate(d.getDate() + days);
  return toISODateLocal(d);
}
