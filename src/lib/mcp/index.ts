import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import getMyWallet from "./tools/get-my-wallet";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "fitmind-mcp",
  title: "FitMind Club MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas do FitMind Club para o usuário autenticado. Use get_my_profile para dados de cadastro e get_my_wallet para consultar saldos das carteiras.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, getMyWallet],
});
