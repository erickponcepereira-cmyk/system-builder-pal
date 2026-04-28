import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) throw new Error("Usuário não autenticado");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Sessão inválida");

    const { foodLogId } = await req.json();
    if (!foodLogId) throw new Error("Registro alimentar não informado");

    const { data: log, error: logError } = await userClient
      .from("food_logs")
      .select("id,student_id,photo_url,description,meal_type,log_date")
      .eq("id", foodLogId)
      .maybeSingle();
    if (logError || !log) throw new Error("Registro alimentar não encontrado");

    const { data: signed } = log.photo_url
      ? await adminClient.storage.from("food-photos").createSignedUrl(log.photo_url, 60 * 10)
      : { data: null };

    const prompt = `Analise a refeição para um app fitness brasileiro. Retorne somente JSON válido com: foods (array), calories, protein_g, carbs_g, fat_g, confidence, summary, coach_tip. Descrição do aluno: ${log.description || "não informada"}. Tipo: ${log.meal_type || "refeição"}.`;
    const content = signed?.signedUrl
      ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: signed.signedUrl } }]
      : [{ type: "text", text: prompt }];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content }], response_format: { type: "json_object" } }),
    });
    if (!aiRes.ok) throw new Error("Não foi possível analisar a refeição agora");
    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content || "{}";
    const analysis = JSON.parse(raw);

    const { error: updateError } = await adminClient
      .from("food_logs")
      .update({ ai_analysis: analysis })
      .eq("id", foodLogId);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ analysis }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro inesperado" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
