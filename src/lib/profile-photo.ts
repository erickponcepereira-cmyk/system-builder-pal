/** Foto de perfil: usa photo_url (novo) com fallback para avatar_url (legado). */
export function profilePhoto(
  p: { photo_url?: string | null; avatar_url?: string | null } | null | undefined,
): string | null {
  if (!p) return null;
  return p.photo_url || p.avatar_url || null;
}
