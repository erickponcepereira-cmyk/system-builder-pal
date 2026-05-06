import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/invite/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { data, error } = await supabaseAdmin
          .from("internal_appointments")
          .select("id,summary,description,start_at,end_at,location,attendee_name,attendee_email,attendee_confirmed,html_link")
          .eq("public_token", params.token)
          .maybeSingle();
        if (error || !data) {
          return new Response(JSON.stringify({ error: "Convite não encontrado" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json(data);
      },
      POST: async ({ params }) => {
        const { data, error } = await supabaseAdmin
          .from("internal_appointments")
          .update({ attendee_confirmed: true, attendee_confirmed_at: new Date().toISOString() })
          .eq("public_token", params.token)
          .select("id")
          .maybeSingle();
        if (error || !data) {
          return new Response(JSON.stringify({ error: "Convite não encontrado" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
