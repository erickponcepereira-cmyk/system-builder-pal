import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const processMediaJobsSchema = z.object({
  reportId: z.string().uuid().optional(),
  appealId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

export const processUgcMediaJobs = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => processMediaJobsSchema.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const { processUgcMediaJobsForModerator } = await import("./ugc-media-jobs.server");
    return processUgcMediaJobsForModerator(context.userId, data);
  });
