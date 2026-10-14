import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_my_wallet",
  title: "Get my wallet balance",
  description: "Return the signed-in user's wallet balance: available, pending release, total earned and withdrawn. It is a single balance, the same one the admin sees.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("user_id", ctx.getUserId()).maybeSingle();
    if (!profile) {
      return { content: [{ type: "text", text: "Profile not found" }], isError: true };
    }
    // Saldo único, derivado do extrato. A tabela `wallets` só tem a fatia de
    // coach e envelhece quando um valor vence a carência.
    const { data, error } = await supabase.rpc("carteira_atual" as never, { _profile_id: profile.id } as never);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const carteira = ((data as Array<Record<string, number>> | null) ?? [])[0];
    const wallet = {
      available: Number(carteira?.disponivel ?? 0),
      pending_release: Number(carteira?.pendente ?? 0) + Number(carteira?.bloqueado_por_meta ?? 0),
      total_earned: Number(carteira?.ganho ?? 0),
      total_withdrawn: Number(carteira?.sacado ?? 0),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(wallet, null, 2) }],
      structuredContent: { wallet },
    };
  },
});
