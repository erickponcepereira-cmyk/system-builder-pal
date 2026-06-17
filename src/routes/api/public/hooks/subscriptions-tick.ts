import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/subscriptions-tick")({
  server: {
    handlers: {
      POST: async () => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data: gen, error: e1 } = await supabase.rpc("generate_monthly_invoices");
        if (e1) return Response.json({ error: e1.message }, { status: 500 });
        const { error: e2 } = await supabase.rpc("mark_overdue_invoices");
        if (e2) return Response.json({ error: e2.message }, { status: 500 });
        return Response.json({ ok: true, generated: gen });
      },
    },
  },
});
