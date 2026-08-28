// Edge Function: send-push-notification
// Envia notificacoes individuais via Firebase Cloud Messaging HTTP v1.
// Somente administradores autenticados podem chamar esta funcao.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://fitmindclub.com.br",
  "https://www.fitmindclub.com.br",
  "https://fitmindclub.lovable.app",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;
const MAX_TITLE_LENGTH = 80;
const MAX_BODY_LENGTH = 300;
const MAX_DATA_ENTRIES = 20;
const MAX_DATA_VALUE_LENGTH = 500;
const MAX_DATA_BYTES = 4_000;
const MAX_SENDS_PER_MINUTE = 30;

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

type DeliveryError = {
  status: number;
  code: string;
};

function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get("PUSH_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function responseHeaders(req: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  const origin = req.headers.get("Origin");
  if (origin && allowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(req),
  });
}

function readBearerToken(req: Request): string | null {
  const authorization = req.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validatePayload(value: unknown):
  | { ok: true; payload: PushPayload }
  | { ok: false; error: string } {
  if (!isPlainRecord(value)) {
    return { ok: false, error: "Corpo da requisicao invalido" };
  }

  const userId = typeof value.userId === "string" ? value.userId.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const body = typeof value.body === "string" ? value.body.trim() : "";

  if (!UUID_PATTERN.test(userId)) {
    return { ok: false, error: "userId invalido" };
  }
  if (!title || title.length > MAX_TITLE_LENGTH) {
    return {
      ok: false,
      error: `title deve ter entre 1 e ${MAX_TITLE_LENGTH} caracteres`,
    };
  }
  if (!body || body.length > MAX_BODY_LENGTH) {
    return {
      ok: false,
      error: `body deve ter entre 1 e ${MAX_BODY_LENGTH} caracteres`,
    };
  }

  let data: Record<string, string> | undefined;
  if (value.data !== undefined) {
    if (!isPlainRecord(value.data)) {
      return { ok: false, error: "data deve ser um objeto de strings" };
    }
    const entries = Object.entries(value.data);
    if (entries.length > MAX_DATA_ENTRIES) {
      return {
        ok: false,
        error: `data aceita no maximo ${MAX_DATA_ENTRIES} campos`,
      };
    }

    data = {};
    for (const [key, entryValue] of entries) {
      if (!DATA_KEY_PATTERN.test(key) || typeof entryValue !== "string") {
        return { ok: false, error: "data contem chave ou valor invalido" };
      }
      if (entryValue.length > MAX_DATA_VALUE_LENGTH) {
        return { ok: false, error: "data contem valor muito longo" };
      }
      data[key] = entryValue;
    }

    if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_DATA_BYTES) {
      return { ok: false, error: "data excede o tamanho permitido" };
    }
  }

  return { ok: true, payload: { userId, title, body, data } };
}

function base64UrlEncode(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);
  let result = "";
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    buffer[index] = binary.charCodeAt(index);
  }
  return buffer.buffer;
}

async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const tokenUri =
    serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const unsigned = `${base64UrlEncode(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  )}.${base64UrlEncode(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: tokenUri,
      iat: now,
      exp: now + 3_600,
    }),
  )}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`;

  const result = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!result.ok) {
    throw new Error(`FCM OAuth returned HTTP ${result.status}`);
  }

  const tokenPayload = (await result.json()) as { access_token?: unknown };
  if (typeof tokenPayload.access_token !== "string") {
    throw new Error("FCM OAuth did not return an access token");
  }
  return tokenPayload.access_token;
}

function fcmErrorCode(responseBody: unknown): string {
  if (!isPlainRecord(responseBody) || !isPlainRecord(responseBody.error)) {
    return "FCM_ERROR";
  }

  const error = responseBody.error;
  if (Array.isArray(error.details)) {
    for (const detail of error.details) {
      if (
        isPlainRecord(detail) &&
        typeof detail.errorCode === "string" &&
        detail.errorCode.length <= 80
      ) {
        return detail.errorCode;
      }
    }
  }
  return typeof error.status === "string" && error.status.length <= 80
    ? error.status
    : "FCM_ERROR";
}

async function sendToToken(
  accessToken: string,
  projectId: string,
  token: string,
  payload: PushPayload,
): Promise<{ ok: boolean; status: number; code: string }> {
  const result = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
          android: { priority: "HIGH" },
          apns: { headers: { "apns-priority": "10" } },
        },
      }),
    },
  );
  const responseBody = await result.json().catch(() => ({}));
  return {
    ok: result.ok,
    status: result.status,
    code: result.ok ? "OK" : fcmErrorCode(responseBody),
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins().has(origin)) {
      return jsonResponse(req, { error: "Origem nao permitida" }, 403);
    }
    return new Response(null, { status: 204, headers: responseHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Metodo nao permitido" }, 405);
  }
  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse(req, { error: "Origem nao permitida" }, 403);
  }

  const bearerToken = readBearerToken(req);
  if (!bearerToken) {
    return jsonResponse(req, { error: "Autenticacao obrigatoria" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase service credentials are not configured");
    return jsonResponse(req, { error: "Servico temporariamente indisponivel" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } =
      await supabase.auth.getUser(bearerToken);
    if (authError || !authData.user) {
      return jsonResponse(req, { error: "Sessao invalida ou expirada" }, 401);
    }

    const actorUserId = authData.user.id;
    const { data: actorProfile, error: actorProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (actorProfileError) {
      console.error("Failed to verify push actor role", actorProfileError.message);
      return jsonResponse(req, { error: "Nao foi possivel validar a permissao" }, 500);
    }
    if (actorProfile?.role !== "admin") {
      return jsonResponse(req, { error: "Acesso restrito a administradores" }, 403);
    }

    const since = new Date(Date.now() - 60_000).toISOString();
    const { count: recentSends, error: rateLimitError } = await supabase
      .from("push_notification_audit")
      .select("id", { count: "exact", head: true })
      .eq("actor_user_id", actorUserId)
      .gte("created_at", since);
    if (rateLimitError) {
      console.error("Failed to evaluate push rate limit", rateLimitError.message);
      return jsonResponse(req, { error: "Nao foi possivel validar o limite de envio" }, 503);
    }
    if ((recentSends ?? 0) >= MAX_SENDS_PER_MINUTE) {
      return jsonResponse(
        req,
        { error: "Limite temporario de notificacoes atingido" },
        429,
      );
    }

    let rawPayload: unknown;
    try {
      rawPayload = await req.json();
    } catch {
      return jsonResponse(req, { error: "JSON invalido" }, 400);
    }
    const validation = validatePayload(rawPayload);
    if (!validation.ok) {
      return jsonResponse(req, { error: validation.error }, 400);
    }
    const payload = validation.payload;

    const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountRaw) {
      console.error("FIREBASE_SERVICE_ACCOUNT is not configured");
      return jsonResponse(req, { error: "Servico de push nao configurado" }, 503);
    }

    let serviceAccount: ServiceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountRaw) as ServiceAccount;
      if (
        !serviceAccount.client_email ||
        !serviceAccount.private_key ||
        !serviceAccount.project_id
      ) {
        throw new Error("Missing service account properties");
      }
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    } catch (error) {
      console.error(
        "Invalid FIREBASE_SERVICE_ACCOUNT",
        error instanceof Error ? error.message : "unknown error",
      );
      return jsonResponse(req, { error: "Servico de push nao configurado" }, 503);
    }

    const { data: tokens, error: tokensError } = await supabase
      .from("device_tokens")
      .select("token")
      .eq("user_id", payload.userId);
    if (tokensError) {
      console.error("Failed to load device tokens", tokensError.message);
      return jsonResponse(req, { error: "Erro ao localizar dispositivos" }, 500);
    }

    const tokensFound = tokens?.length ?? 0;
    let sent = 0;
    const errors: DeliveryError[] = [];
    const invalidTokens: string[] = [];

    if (tokensFound > 0) {
      const accessToken = await getAccessToken(serviceAccount);
      for (const row of tokens ?? []) {
        try {
          const result = await sendToToken(
            accessToken,
            serviceAccount.project_id,
            row.token,
            payload,
          );
          if (result.ok) {
            sent += 1;
          } else {
            errors.push({ status: result.status, code: result.code });
            if (result.code === "UNREGISTERED") invalidTokens.push(row.token);
          }
        } catch (error) {
          console.error(
            "FCM delivery failed",
            error instanceof Error ? error.message : "unknown error",
          );
          errors.push({ status: 0, code: "DELIVERY_ERROR" });
        }
      }
    }

    if (invalidTokens.length > 0) {
      const { error: cleanupError } = await supabase
        .from("device_tokens")
        .delete()
        .in("token", invalidTokens);
      if (cleanupError) {
        console.error("Failed to clean invalid device tokens", cleanupError.message);
      }
    }

    const { error: auditError } = await supabase
      .from("push_notification_audit")
      .insert({
        actor_user_id: actorUserId,
        target_user_id: payload.userId,
        title: payload.title,
        body_length: payload.body.length,
        data_keys: Object.keys(payload.data ?? {}),
        tokens_found: tokensFound,
        sent,
        failed: errors.length,
        cleaned_invalid_tokens: invalidTokens.length,
      });
    if (auditError) {
      console.error("Failed to write push audit", auditError.message);
    }

    return jsonResponse(req, {
      tokensFound,
      sent,
      errors,
      cleanedInvalidTokens: invalidTokens.length,
    });
  } catch (error) {
    console.error(
      "Unhandled send-push-notification error",
      error instanceof Error ? error.message : "unknown error",
    );
    return jsonResponse(req, { error: "Erro interno no envio da notificacao" }, 500);
  }
});
