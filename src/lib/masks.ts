// CPF mask
export function maskCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// Returns CPF as 11-digit string only (or null otherwise)
export function onlyCPFDigits(value: string | null | undefined): string | null {
  const d = (value || "").replace(/\D/g, "");
  return d.length === 11 ? d : null;
}

// Formats a stored CPF for display
export function formatCPF(value: string | null | undefined): string {
  const d = (value || "").replace(/\D/g, "");
  if (d.length !== 11) return value || "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// LGPD: máscara de CPF para exibição pública (oculta 3 primeiros e 2 últimos)
// Ex.: 123.456.789-01 -> ***.456.789-**
export function maskCPFSensitive(value: string | null | undefined): string {
  const d = (value || "").replace(/\D/g, "");
  if (d.length !== 11) return value ? "***.***.***-**" : "";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

// LGPD: máscara de CPF/CNPJ (aceita ambos) para exibição pública
// CPF (11)  -> ***.456.789-**
// CNPJ (14) -> **.345.678/0001-**
export function maskDocumentSensitive(value: string | null | undefined): string {
  const d = (value || "").replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return value ? "***" : "";
}

// LGPD: máscara de email (oculta a maior parte do local part)
// Ex.: nathan.utuari@hotmail.com -> n***@hotmail.com
export function maskEmailSensitive(value: string | null | undefined): string {
  if (!value) return "";
  const [local, domain] = value.split("@");
  if (!domain) return value;
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(3, local.length - 1))}@${domain}`;
}

// LGPD: máscara de telefone (mostra DDD + últimos 4)
// Ex.: 11999991234 -> (11) *****-1234
export function maskPhoneSensitive(value: string | null | undefined): string {
  if (!value) return "";
  const d = value.replace(/\D/g, "");
  if (d.length < 10) return value;
  const ddd = d.slice(0, 2);
  const last4 = d.slice(-4);
  return `(${ddd}) *****-${last4}`;
}

// Validates CPF using the official algorithm
export function isValidCPF(value: string | null | undefined): boolean {
  const cpf = (value || "").replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calcDigit = (base: string, factorStart: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += parseInt(base[i], 10) * (factorStart - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = calcDigit(cpf.slice(0, 9), 10);
  if (d1 !== parseInt(cpf[9], 10)) return false;
  const d2 = calcDigit(cpf.slice(0, 10), 11);
  if (d2 !== parseInt(cpf[10], 10)) return false;
  return true;
}



// Phone mask
export function maskPhone(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

// CEP mask
export function maskCEP(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export function maskCNPJ(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
