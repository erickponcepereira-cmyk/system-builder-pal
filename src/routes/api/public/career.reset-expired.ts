import { createFileRoute } from '@tanstack/react-router';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/public/career/reset-expired')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CAREER_CRON_SECRET;
        if (!secret) {
          return new Response('Server not configured', { status: 500 });
        }

        const provided = request.headers.get('x-cron-secret') ?? '';
        const a = Buffer.from(provided);
        const b = Buffer.from(secret);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          // Also accept HMAC signature for extra flexibility
          const sig = request.headers.get('x-webhook-signature');
          const body = await request.clone().text();
          const expected = createHmac('sha256', secret).update(body).digest('hex');
          if (
            !sig ||
            sig.length !== expected.length ||
            !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
          ) {
            return new Response('Unauthorized', { status: 401 });
          }
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
