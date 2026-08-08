/**
 * Sexo biológico usado nos cálculos de composição corporal.
 * Três estados: "male", "female" e "unknown" — nunca assumir feminino
 * quando o dado não existe, pois todas as métricas mudam.
 */
export type BioGender = "male" | "female" | "unknown";

export function normalizeGender(value?: string | null): BioGender {
  const g = (value || "").toString().trim().toLowerCase();
  if (g === "m" || g === "male" || g === "masculino" || g === "homem") return "male";
  if (g === "f" || g === "female" || g === "feminino" || g === "mulher") return "female";
  return "unknown";
}

/** Rótulo em português para exibição. */
export function genderLabel(value?: string | null): string {
  const g = normalizeGender(value);
  return g === "male" ? "Masculino" : g === "female" ? "Feminino" : "Sexo não definido";
}

/** Rótulo curto para listas. */
export function genderShortLabel(value?: string | null): string {
  const g = normalizeGender(value);
  return g === "male" ? "Masc." : g === "female" ? "Fem." : "Sexo não definido";
}

export function isGenderDefined(value?: string | null): boolean {
  return normalizeGender(value) !== "unknown";
}

/** Converte o sexo do cadastro (profiles.gender: M/F/O) para o formato da ficha. */
export function profileGenderToClient(value?: string | null): "male" | "female" | "other" {
  const g = normalizeGender(value);
  return g === "unknown" ? "other" : g;
}

/** Converte o sexo da ficha para o formato do cadastro (M/F). */
export function clientGenderToProfile(value?: string | null): "M" | "F" | null {
  const g = normalizeGender(value);
  return g === "male" ? "M" : g === "female" ? "F" : null;
}
