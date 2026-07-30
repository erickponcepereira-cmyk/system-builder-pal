import { lerAtribuicao } from "@/lib/atribuicao";

export type ReferralSignup = {
  code: string | null;
  kind?: "coach" | "student" | "partner" | null;
  sponsorName: string | null;
  coachId: string | null;
  referredByStudentId: string | null;
  partnerId: string | null;
};

const SESSION_KEY = "fitmind_referral";
/** Espelho durável: `sessionStorage` não sobrevive ao redirect do OAuth em
 * alguns navegadores e na WebView do APK — era aí que o coach se perdia. */
const BACKUP_KEY = "fitmind_referral_oauth";

const EMPTY: ReferralSignup = {
  code: null, kind: null, sponsorName: null, coachId: null,
  referredByStudentId: null, partnerId: null,
};

function parse(raw: string | null): ReferralSignup | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<ReferralSignup>;
    if (!p?.code && !p?.coachId) return null;
    return {
      code: p.code ?? null,
      kind: p.kind ?? null,
      sponsorName: p.sponsorName ?? null,
      coachId: p.coachId ?? null,
      referredByStudentId: p.referredByStudentId ?? null,
      partnerId: p.partnerId ?? null,
    };
  } catch {
    return null;
  }
}

/** Lê a indicação vigente (sessão → backup do OAuth → atribuição durável). */
export function readReferralSignup(): ReferralSignup {
  if (typeof window === "undefined") return EMPTY;
  const fromSession = parse(window.sessionStorage.getItem(SESSION_KEY));
  if (fromSession) return fromSession;

  const fromBackup = parse(window.localStorage.getItem(BACKUP_KEY));
  if (fromBackup) {
    // Reidrata a sessão para os formulários que já leem `fitmind_referral`.
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(fromBackup));
    } catch { /* ignora */ }
    return fromBackup;
  }

  const a = lerAtribuicao();
  if (a) {
    return {
      code: a.codigo, kind: null, sponsorName: a.coachNome,
      coachId: a.coachId, referredByStudentId: null, partnerId: a.parceiroId,
    };
  }
  return EMPTY;
}

/** Chamar ANTES de sair para o Google: garante que a indicação volte com a pessoa. */
export function persistReferralForOAuth(): ReferralSignup {
  const ref = readReferralSignup();
  if (typeof window !== "undefined" && (ref.code || ref.coachId)) {
    try {
      window.localStorage.setItem(BACKUP_KEY, JSON.stringify(ref));
    } catch { /* ignora */ }
  }
  return ref;
}

/** Limpa o backup depois que a indicação já foi gravada no cadastro. */
export function clearReferralSignup() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BACKUP_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignora */ }
}
