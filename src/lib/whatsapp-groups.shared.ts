import { z } from "zod";

/** Converte link de convite ou número em URL final do WhatsApp. */
export function resolveGroupUrl(inviteUrl: string | null, phone: string | null): string | null {
  if (inviteUrl && /^https?:\/\//i.test(inviteUrl)) return inviteUrl;
  if (phone) {
    let digits = phone.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.length <= 11) digits = "55" + digits;
    return `https://wa.me/${digits}`;
  }
  return null;
}

export type WhatsappGroup = {
  id: string;
  name: string;
  inviteUrl: string | null;
  phone: string | null;
  description: string | null;
  isActive: boolean;
};

export type NetworkWhatsappGroup = {
  id: string;
  name: string;
  description: string | null;
  url: string;
  ownerName: string;
};

export const ownerInputSchema = z.object({
  ownerKind: z.enum(["partner", "professional"]),
  ownerId: z.string().uuid(),
});

export const saveGroupSchema = ownerInputSchema.extend({
  name: z.string().trim().min(2).max(80),
  target: z.string().trim().min(3).max(200),
  description: z.string().trim().max(140).optional().nullable(),
  isActive: z.boolean().default(true),
});
