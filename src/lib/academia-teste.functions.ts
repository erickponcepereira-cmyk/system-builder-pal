import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Superfície de TESTE do controle de acesso de academia.
 * Gate duplo: precisa ser master admin (profiles.is_master_admin) E membro
 * da academia (partner_members) — ou dono dela em partners.profile_id.
 */

export type FormaPagamento =
  | "dinheiro"
  | "pix"
  | "cartao_credito"
  | "cartao_debito"
  | "transferencia"
  | "outro";

export const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "cartao_debito", label: "Cartão de débito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outro", label: "Outro" },
];

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function autorizar(userId: string, partnerId: string): Promise<{ admin: Admin; profileId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, is_master_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile || !(profile as { is_master_admin?: boolean }).is_master_admin) {
    throw new Error("Sem acesso.");
  }
  const profileId = (profile as { id: string }).id;

  const [{ data: membro }, { data: dono }] = await Promise.all([
    supabaseAdmin.from("partner_members").select("id").eq("partner_id", partnerId).eq("profile_id", profileId).maybeSingle(),
    supabaseAdmin.from("partners").select("id").eq("id", partnerId).eq("profile_id", profileId).maybeSingle(),
  ]);

  if (!membro && !dono) throw new Error("Sem acesso a esta academia.");

  return { admin: supabaseAdmin as Admin, profileId };
}

function arred(n: number) {
  return Math.round(n * 100) / 100;
}

async function taxaPlataforma(admin: Admin, forma: FormaPagamento): Promise<number> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("payment_fee_configs")
    .select("card_fee_percentage, pix_fee_percentage, is_default, valid_from, valid_until")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Array<{
    card_fee_percentage: number;
    pix_fee_percentage: number;
    valid_from: string | null;
    valid_until: string | null;
  }>;
  const cfg = rows.find(
    (r) => (!r.valid_from || r.valid_from <= hoje) && (!r.valid_until || r.valid_until >= hoje),
  );
  if (!cfg) return 0;

  if (forma === "pix") return Number(cfg.pix_fee_percentage) || 0;
  if (forma === "cartao_credito" || forma === "cartao_debito") return Number(cfg.card_fee_percentage) || 0;
  return 0;
}

async function calcularTaxa(
  admin: Admin,
  partnerId: string,
  origem: "interna" | "externa",
  forma: FormaPagamento,
  valor: number,
): Promise<{ taxaPercentual: number; taxaValor: number; valorLiquido: number; fonte: "dinheiro" | "plataforma" | "academia" | "nao_configurada" }> {
  if (forma === "dinheiro") {
    return { taxaPercentual: 0, taxaValor: 0, valorLiquido: arred(valor), fonte: "dinheiro" };
  }

  if (origem === "interna") {
    const pct = await taxaPlataforma(admin, forma);
    const taxaValor = arred((valor * pct) / 100);
    return { taxaPercentual: pct, taxaValor, valorLiquido: arred(valor - taxaValor), fonte: "plataforma" };
  }

  const { data } = await admin
    .from("partner_taxas_externas")
    .select("taxa_percentual, taxa_fixa")
    .eq("partner_id", partnerId)
    .eq("forma_pagamento", forma)
    .maybeSingle();

  if (!data) {
    return { taxaPercentual: 0, taxaValor: 0, valorLiquido: arred(valor), fonte: "nao_configurada" };
  }
  const row = data as { taxa_percentual: number; taxa_fixa: number };
  const pct = Number(row.taxa_percentual) || 0;
  const fixa = Number(row.taxa_fixa) || 0;
  const taxaValor = arred((valor * pct) / 100 + fixa);
  return { taxaPercentual: pct, taxaValor, valorLiquido: arred(valor - taxaValor), fonte: "academia" };
}

export const previewTaxaAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; origem: "interna" | "externa"; formaPagamento: FormaPagamento; valor: number }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    return calcularTaxa(admin, data.partnerId, data.origem, data.formaPagamento, Number(data.valor) || 0);
  });

export const listarAlunosAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const { data: cfg } = await admin
      .from("partner_acesso_config")
      .select("dias_carencia, timezone")
      .eq("partner_id", data.partnerId)
      .maybeSingle();
    const carencia = Number((cfg as { dias_carencia?: number } | null)?.dias_carencia ?? 3);
    const tz = (cfg as { timezone?: string } | null)?.timezone ?? "America/Sao_Paulo";

    const { data: rows, error } = await admin
      .from("academia_mensalidades")
      .select("id, student_id, plano, valor, valido_ate, origem, forma_pagamento, taxa_percentual, taxa_valor, valor_liquido, created_at")
      .eq("partner_id", data.partnerId)
      .order("valido_ate", { ascending: false });
    if (error) throw new Error(error.message);

    const lista = (rows ?? []) as Array<{
      id: string; student_id: string; plano: string; valor: number; valido_ate: string;
      origem: string; forma_pagamento: string; taxa_percentual: number; taxa_valor: number;
      valor_liquido: number; created_at: string;
    }>;

    // Mantém apenas o registro de maior validade por aluno
    const porAluno = new Map<string, (typeof lista)[number]>();
    for (const r of lista) if (!porAluno.has(r.student_id)) porAluno.set(r.student_id, r);

    const studentIds = Array.from(porAluno.keys());
    const nomes = new Map<string, string>();
    if (studentIds.length > 0) {
      const { data: studs } = await admin.from("students").select("id, profile_id").in("id", studentIds);
      const profIds = ((studs ?? []) as Array<{ id: string; profile_id: string }>).map((s) => s.profile_id);
      const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", profIds);
      const mapProf = new Map(((profs ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? "Sem nome"]));
      for (const s of (studs ?? []) as Array<{ id: string; profile_id: string }>) {
        nomes.set(s.id, mapProf.get(s.profile_id) ?? "Sem nome");
      }
    }

    const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const diff = (ate: string) =>
      Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${hojeStr}T00:00:00Z`)) / 86400000);

    return {
      carencia,
      alunos: Array.from(porAluno.values()).map((r) => {
        const dias = diff(r.valido_ate);
        const estado =
          dias >= 4 ? "ativo" : dias >= 0 ? "vence_em_breve" : dias >= -carencia ? "em_carencia" : "bloqueado";
        return { ...r, nome: nomes.get(r.student_id) ?? "Sem nome", dias_restantes: dias, estado };
      }),
    };
  });

export const buscarAlunosParaMensalidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; termo: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const termo = (data.termo || "").trim();
    if (termo.length < 3) return { alunos: [] as Array<{ studentId: string; nome: string }> };

    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name")
      .ilike("full_name", `%${termo}%`)
      .limit(20);
    const ids = ((profs ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (ids.length === 0) return { alunos: [] };

    const { data: studs } = await admin.from("students").select("id, profile_id").in("profile_id", ids);
    const mapProf = new Map(((profs ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? "Sem nome"]));
    return {
      alunos: ((studs ?? []) as Array<{ id: string; profile_id: string }>).map((s) => ({
        studentId: s.id,
        nome: mapProf.get(s.profile_id) ?? "Sem nome",
      })),
    };
  });

export const registrarMensalidadeAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; studentId: string; plano: string; valor: number;
    validoAte: string; origem: "interna" | "externa"; formaPagamento: FormaPagamento; observacao?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin, profileId } = await autorizar(context.userId, data.partnerId);
    const valor = Number(data.valor) || 0;
    const taxa = await calcularTaxa(admin, data.partnerId, data.origem, data.formaPagamento, valor);

    const { error } = await admin.from("academia_mensalidades").insert({
      partner_id: data.partnerId,
      student_id: data.studentId,
      plano: data.plano,
      valor,
      valido_ate: data.validoAte,
      origem: data.origem,
      forma_pagamento: data.formaPagamento,
      taxa_percentual: taxa.taxaPercentual,
      taxa_valor: taxa.taxaValor,
      valor_liquido: taxa.valorLiquido,
      registrado_por: profileId,
      observacao: data.observacao ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true, ...taxa };
  });

export const obterConfigAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: cfg } = await admin
      .from("partner_acesso_config")
      .select("dias_carencia, exige_senha_liberacao, regra_dayuse, timezone, modelo_catraca")
      .eq("partner_id", data.partnerId)
      .maybeSingle();
    const { data: taxas } = await admin
      .from("partner_taxas_externas")
      .select("forma_pagamento, taxa_percentual, taxa_fixa")
      .eq("partner_id", data.partnerId);
    return {
      config: (cfg as null | {
        dias_carencia: number; exige_senha_liberacao: boolean; regra_dayuse: string;
        timezone: string; modelo_catraca: string | null;
      }) ?? {
        dias_carencia: 3,
        exige_senha_liberacao: false,
        regra_dayuse: "uma_vez_na_vida",
        timezone: "America/Sao_Paulo",
        modelo_catraca: null,
      },
      taxas: (taxas ?? []) as Array<{ forma_pagamento: FormaPagamento; taxa_percentual: number; taxa_fixa: number }>,
    };
  });

export const salvarConfigAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; diasCarencia: number; exigeSenha: boolean;
    regraDayuse: string; timezone: string; modeloCatraca: string | null;
    taxas: Array<{ forma_pagamento: FormaPagamento; taxa_percentual: number; taxa_fixa: number }>;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const { error } = await admin.from("partner_acesso_config").upsert(
      {
        partner_id: data.partnerId,
        dias_carencia: data.diasCarencia,
        exige_senha_liberacao: data.exigeSenha,
        regra_dayuse: data.regraDayuse,
        timezone: data.timezone,
        modelo_catraca: data.modeloCatraca,
      },
      { onConflict: "partner_id" },
    );
    if (error) throw new Error(error.message);

    for (const t of data.taxas) {
      const { error: e2 } = await admin.from("partner_taxas_externas").upsert(
        {
          partner_id: data.partnerId,
          forma_pagamento: t.forma_pagamento,
          taxa_percentual: Number(t.taxa_percentual) || 0,
          taxa_fixa: Number(t.taxa_fixa) || 0,
        },
        { onConflict: "partner_id,forma_pagamento" },
      );
      if (e2) throw new Error(e2.message);
    }
    return { ok: true };
  });
