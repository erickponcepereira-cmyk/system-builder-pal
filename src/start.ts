import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { capacitorCorsMiddleware, serverFnCsrfMiddleware } from "@/lib/native-request-security";
import { mobileApiOrigin, mobileServerFnFetch } from "@/lib/mobile-backend";

export const startInstance = createStart(() => ({
  requestMiddleware: [capacitorCorsMiddleware, serverFnCsrfMiddleware],
  functionMiddleware: [attachSupabaseAuth],
  ...(mobileApiOrigin ? { serverFns: { fetch: mobileServerFnFetch } } : {}),
}));
