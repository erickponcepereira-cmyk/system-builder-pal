// Edge Function: send-push-notification
// Envia notificações push via Firebase Cloud Messaging HTTP v1
//
// Body esperado:
// {
//   userId: string,
//   title: string,
//   body: string,
//   data?: Record<string, string>
// }
//
// Estrutura preparada para reutilização em:
// - Lembrete de treino
// - Lembrete de consulta
// - Notificações de coach
// - Campanhas da FitMind

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

// ------------------------------------------------------------------
// OAuth2: gera access_token para a FCM HTTP v1 a partir do service account
// ------------------------------------------------------------------
function base64UrlEncode(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claim),
  )}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64UrlEncode(sig)}`;

  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`OAuth token error: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

// ------------------------------------------------------------------
// Envio individual de mensagem via FCM HTTP v1
// ------------------------------------------------------------------
async function sendToToken(
  accessToken: string,
  projectId: string,
  token: string,
  payload: PushPayload,
): Promise<{ ok: boolean; status: number; response: unknown }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const message = {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data
        ? Object.fromEntries(
            Object.entries(payload.data).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
      android: { priority: "HIGH" },
      apns: { headers: { "apns-priority": "10" } },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  const responseBody = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, response: responseBody };
}

// ------------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as PushPayload;

    if (!payload?.userId || !payload?.title || !payload?.body) {
      return new Response(
        JSON.stringify({ error: "userId, title e body são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const saRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!saRaw) {
      return new Response(
        JSON.stringify({ error: "FIREBASE_SERVICE_ACCOUNT não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let serviceAccount: ServiceAccount;
    try {
      serviceAccount = JSON.parse(saRaw);
      // Suporta chave privada com \n escapado
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    } catch {
      return new Response(
        JSON.stringify({ error: "FIREBASE_SERVICE_ACCOUNT inválido (JSON)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cliente admin para ler tokens (bypassa RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokens, error: tokensError } = await supabase
      .from("device_tokens")
      .select("token, platform")
      .eq("user_id", payload.userId);

    if (tokensError) {
      return new Response(
        JSON.stringify({ error: "Erro ao buscar tokens", details: tokensError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tokensFound = tokens?.length ?? 0;
    if (tokensFound === 0) {
      return new Response(
        JSON.stringify({ tokensFound: 0, sent: 0, errors: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken = await getAccessToken(serviceAccount);

    let sent = 0;
    const errors: Array<{ token: string; status: number; response: unknown }> = [];
    const invalidTokens: string[] = [];

    for (const row of tokens!) {
      try {
        const result = await sendToToken(
          accessToken,
          serviceAccount.project_id,
          row.token,
          payload,
        );
        if (result.ok) {
          sent++;
        } else {
          errors.push({ token: row.token, status: result.status, response: result.response });
          // Tokens inválidos / não registrados devem ser limpos
          if (result.status === 404 || result.status === 400) {
            invalidTokens.push(row.token);
          }
        }
      } catch (err) {
        errors.push({
          token: row.token,
          status: 0,
          response: { message: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    // Limpeza opcional de tokens inválidos
    if (invalidTokens.length > 0) {
      await supabase.from("device_tokens").delete().in("token", invalidTokens);
    }

    return new Response(
      JSON.stringify({
        tokensFound,
        sent,
        errors,
        cleanedInvalidTokens: invalidTokens.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Erro interno",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
