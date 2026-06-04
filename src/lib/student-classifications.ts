// Helpers para classificar um aluno por papel.
// "Aluno" = somente aluno (sem ser coach nem parceiro) — único que pode entrar no desafio.

export type StudentClassification = "aluno" | "aluno_coach" | "aluno_profissional" | "aluno_parceiro";

export const CLASSIFICATION_LABEL: Record<StudentClassification, string> = {
  aluno: "Aluno",
  aluno_coach: "Aluno Coach",
  aluno_profissional: "Aluno Profissional",
  aluno_parceiro: "Aluno Parceiro",
};

export function classifyByProfile(
  profileId: string | null | undefined,
  coachProfiles: Map<string, { is_professional: boolean | null }> | Set<string>,
  professionalProfiles: Set<string>,
  partnerProfiles: Set<string>,
): StudentClassification {
  if (!profileId) return "aluno";
  const isCoach = coachProfiles instanceof Set ? coachProfiles.has(profileId) : coachProfiles.has(profileId);
  const isProfessional = professionalProfiles.has(profileId);
  const isPartner = partnerProfiles.has(profileId);
  if (isProfessional) return "aluno_profissional";
  if (isCoach) return "aluno_coach";
  if (isPartner) return "aluno_parceiro";
  return "aluno";
}

// True só para "aluno puro" — únicos autorizados a participar do desafio e ganhar moedas.
export function isPureStudent(classification: StudentClassification): boolean {
  return classification === "aluno";
}
