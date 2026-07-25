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
  description: "Return the signed-in user's wallet balances (available, pending, total).",
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
    const { data, error } = await supabase
      .from("wallets")
      .select("wallet_type, available_balance, pending_balance, total_earned, total_withdrawn")
      .eq("profile_id", profile.id);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { wallets: data ?? [] },
    };
  },
});
