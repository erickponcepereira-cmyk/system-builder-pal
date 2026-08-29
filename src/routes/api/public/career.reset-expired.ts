import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { authorizeInternalCron, internalHookJson } from '@/server/internal-hook-auth.server';

export const Route = createFileRoute('/api/public/career/reset-expired')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = authorizeInternalCron(request);
        if (unauthorized) return unauthorized;

        const { data, error } = await supabaseAdmin.rpc('reset_expired_career_period_plans');
        if (error) {
          console.error('[career-reset-expired]', error.message);
          return internalHookJson({ ok: false, error: 'Falha ao redefinir planos expirados' }, 500);
        }

        return internalHookJson({
          ok: true,
          reset_count: data ?? 0,
          ran_at: new Date().toISOString(),
        });
      },
    },
  },
});
