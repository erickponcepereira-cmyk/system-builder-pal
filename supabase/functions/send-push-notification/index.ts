// Edge Function: send-push-notification
// Envia push FCM HTTP v1. Somente administradores autenticados podem chamar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = new Set([
  "https://fitmindclub.com.br",
  "https://www.fitmindclub.com.br",
  "https://fitmindclub.lovable.app",
]);

const FCM_CHANNEL_ID = "fitmind_default";

interface PushPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

function corsHeaders(origin: string | null) {
  // Requests Capacitor podem não ter Origin; eles continuam protegidos pelo JWT.
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://fitmindclub.com.br";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function base64UrlEncode(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let index = 0; index < bin.length; index += 1) buf[index] = bin.charCodeAt(index);
  return buf.buffer;
}

async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const tokenUri = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const unsigned = `${base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64UrlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: tokenUri,
    iat: now,
    exp: now + 3_600,
  }))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64UrlEncode(signature)}`;

  const tokenResponse = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!tokenResponse.ok) throw new Error("Firebase OAuth token request failed");
  const token = (await tokenResponse.json()).access_token as string | undefined;
  if (!token) throw new Error("Firebase OAuth token missing");
  return token;
}

async function requireAdmin(req: Request, adminClient: ReturnType<typeof createClient>) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return { ok: false as const, status: 401 };

  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401 };

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError || profile?.role !== "admin") return { ok: false as const, status: 403 };
  return { ok: true as const };
}

async function sendToToken(
  accessToken: string,
  projectId: string,
  token: string,
  payload: PushPayload,
): Promise<{ ok: boolean; status: number; errorCode?: string }> {
  const result = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data
          ? Object.fromEntries(Object.entries(payload.data).map(([key, value]) => [key, String(value)]))
          : undefined,
        android: {
          priority: "HIGH",
          notification: { channel_id: FCM_CHANNEL_ID, icon: "ic_stat_notify" },
        },
        apns: {
          headers: { "apns-priority": "10" },
          payload: { aps: { sound: "default" } },
        },
      },
    }),
  });
  const body = await result.json().catch(() => null) as { error?: { status?: string } } | null;
  return { ok: result.ok, status: result.status, errorCode: body?.error?.status };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (origin && !ALLOWED_ORIGINS.has(origin)) return response({ error: "Origin not allowed" }, 403, origin);
    return new Response(null, { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return response({ error: "Origin not allowed" }, 403, origin);

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const authorization = await requireAdmin(req, serviceClient);
  if (!authorization.ok) return response({ error: authorization.status === 401 ? "Unauthorized" : "Forbidden" }, authorization.status, origin);

  try {
    const payload = await req.json() as PushPayload;
    if (!payload?.userId || !payload?.title || !payload?.body) {
      return response({ error: "userId, title e body são obrigatórios" }, 400, origin);
    }
    if (payload.title.length > 120 || payload.body.length > 2_000) {
      return response({ error: "Mensagem excede o tamanho permitido" }, 400, origin);
    }

    const rawServiceAccount = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!rawServiceAccount) return response({ error: "Push ainda não está configurado" }, 503, origin);

    let serviceAccount: ServiceAccount;
    try {
      serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccount;
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    } catch {
      console.error("[Push] FIREBASE_SERVICE_ACCOUNT invalid");
      return response({ error: "Push temporariamente indisponível" }, 503, origin);
    }

    const { data: tokens, error: tokenError } = await serviceClient
      .from("device_tokens")
      .select("token")
      .eq("user_id", payload.userId);
    if (tokenError) {
      console.error("[Push] token lookup failed", tokenError.message);
      return response({ error: "Não foi possível localizar dispositivos" }, 500, origin);
    }
    if (!tokens?.length) return response({ tokensFound: 0, sent: 0, failed: 0 }, 200, origin);

    const accessToken = await getAccessToken(serviceAccount);
    let sent = 0;
    let failed = 0;
    const invalidTokens: string[] = [];
    for (const { token } of tokens) {
      try {
        const result = await sendToToken(accessToken, serviceAccount.project_id, token, payload);
        if (result.ok) sent += 1;
        else {
          failed += 1;
          if (result.status === 400 || result.status === 404 || result.errorCode === "UNREGISTERED") invalidTokens.push(token);
        }
      } catch (error) {
        failed += 1;
        console.error("[Push] FCM send failed", error instanceof Error ? error.message : String(error));
      }
    }
    if (invalidTokens.length) await serviceClient.from("device_tokens").delete().in("token", invalidTokens);

    return response({ tokensFound: tokens.length, sent, failed, cleanedInvalidTokens: invalidTokens.length }, 200, origin);
  } catch (error) {
    console.error("[Push] unexpected error", error instanceof Error ? error.message : String(error));
    return response({ error: "Erro interno ao enviar notificação" }, 500, origin);
  }
});
