import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ownerInputSchema, saveGroupSchema } from "./whatsapp-groups.shared";
import type { WhatsappGroup, NetworkWhatsappGroup } from "./whatsapp-groups.shared";

export const getMyWhatsappGroup = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ownerInputSchema.parse(d))
  .handler(async ({ context, data }): Promise<{ grupo: WhatsappGroup | null }> => {
    const { readOwnGroup } = await import("./whatsapp-groups.server");
    return { grupo: await readOwnGroup(context.userId, data.ownerKind, data.ownerId) };
  });

export const saveMyWhatsappGroup = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => saveGroupSchema.parse(d))
  .handler(async ({ context, data }): Promise<{ grupo: WhatsappGroup }> => {
    const { writeOwnGroup } = await import("./whatsapp-groups.server");
    return { grupo: await writeOwnGroup(context.userId, data) };
  });

export const listMyNetworkWhatsappGroups = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ grupos: NetworkWhatsappGroup[] }> => {
    const { readNetworkGroups } = await import("./whatsapp-groups.server");
    return { grupos: await readNetworkGroups(context.userId) };
  });
