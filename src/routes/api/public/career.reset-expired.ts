import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/public/career/reset-expired')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // pg_cron sends the Supabase anon key in the apikey header.
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        const provided = request.headers.get('apikey') ?? '';
        if (!expected || provided !== expected) {
          return new Response('Unauthorized', { status: 401 });
        }

        const { data, error } = await supabaseAdmin.rpc('reset_expired_career_period_plans');
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(
          JSON.stringify({ ok: true, reset_count: data ?? 0, ran_at: new Date().toISOString() }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    },
  },
});
