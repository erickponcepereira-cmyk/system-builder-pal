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
      .select("dias_carencia")
      .eq("partner_id", data.partnerId)
      .maybeSingle();
    const carencia = Number((cfg as { dias_carencia?: number } | null)?.dias_carencia ?? 3);

    const { data: rows, error } = await admin
      .from("academia_mensalidades")
      .select("id, student_id, plano, valor, valido_ate, origem, forma_pagamento, taxa_percentual, taxa_valor, valor_liquido, created_at")
      .eq("partner_id", data.partnerId)
      // Lançamento cancelado/estornado continua no histórico financeiro, mas não
      // conta para acesso. Mesmo filtro aplicado em acesso_avaliar.
      .eq("status", "ativa")
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
      const { data: profs } = await admin.from("profiles").select("id, name").in("id", profIds);
      const mapProf = new Map(((profs ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, p.name ?? "Sem nome"]));
      for (const s of (studs ?? []) as Array<{ id: string; profile_id: string }>) {
        nomes.set(s.id, mapProf.get(s.profile_id) ?? "Sem nome");
      }
    }

    // A régua vive só no banco (acesso_classificar). A tela pergunta em vez de
    // recalcular, senão a listagem e a catraca podem discordar.
    const { data: avaliacoes, error: erroAval } = await admin.rpc("acesso_avaliar_academia", {
      p_partner_id: data.partnerId,
    });
    if (erroAval) throw new Error(erroAval.message);

    const porStudent = new Map(
      ((avaliacoes ?? []) as Array<{
        student_id: string; decisao: string; motivo: string; dias_restantes: number | null;
      }>).map((a) => [a.student_id, a]),
    );

    return {
      carencia,
      alunos: Array.from(porAluno.values()).map((r) => {
        const aval = porStudent.get(r.student_id);
        return {
          ...r,
          nome: nomes.get(r.student_id) ?? "Sem nome",
          dias_restantes: aval?.dias_restantes ?? null,
          decisao: aval?.decisao ?? "negado",
          motivo: aval?.motivo ?? "sem_mensalidade",
        };
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
      .select("id, name")
      .ilike("name", `%${termo}%`)
      .limit(20);
    const ids = ((profs ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (ids.length === 0) return { alunos: [] };

    const { data: studs } = await admin.from("students").select("id, profile_id").in("profile_id", ids);
    const mapProf = new Map(((profs ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, p.name ?? "Sem nome"]));
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

/**
 * Cancela um lançamento sem apagá-lo: a linha permanece para o histórico
 * financeiro e para a conciliação de taxas, apenas deixa de valer para acesso.
 */
export const cancelarMensalidadeAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; mensalidadeId: string;
    status: "cancelada" | "estornada"; motivo: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin, profileId } = await autorizar(context.userId, data.partnerId);

    const motivo = (data.motivo || "").trim();
    if (motivo.length < 3) throw new Error("Descreva o motivo do cancelamento.");
    if (data.status !== "cancelada" && data.status !== "estornada") {
      throw new Error("Status inválido.");
    }

    // O partner_id no filtro impede cancelar lançamento de outra academia mesmo
    // com um id válido em mãos.
    const { data: alvo, error: erroBusca } = await admin
      .from("academia_mensalidades")
      .select("id, status")
      .eq("id", data.mensalidadeId)
      .eq("partner_id", data.partnerId)
      .maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (!alvo) throw new Error("Lançamento não encontrado nesta academia.");
    if ((alvo as { status: string }).status !== "ativa") {
      throw new Error("Este lançamento já não está ativo.");
    }

    const { error } = await admin
      .from("academia_mensalidades")
      .update({
        status: data.status,
        cancelado_em: new Date().toISOString(),
        cancelado_por: profileId,
        motivo_cancelamento: motivo,
      })
      .eq("id", data.mensalidadeId)
      .eq("partner_id", data.partnerId)
      .eq("status", "ativa");
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const MARCOS = ["d3", "d2", "d1", "d0", "ultimo_dia"] as const;

export const ROTULO_MARCO: Record<string, string> = {
  d3: "Faltam 3 dias",
  d2: "Faltam 2 dias",
  d1: "Vence amanhã",
  d0: "Vence hoje",
  ultimo_dia: "Último dia de acesso",
};

type AvisoPendente = {
  student_id: string; nome: string; telefone: string | null;
  marco: string; dias_restantes: number; valido_ate: string;
};

/** Quem receberia aviso hoje, sem enviar nada. */
export const previewAvisosAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const { data: pendentes, error } = await admin.rpc("academia_avisos_pendentes", {
      p_partner_id: data.partnerId,
    });
    if (error) throw new Error(error.message);

    const { data: conexao } = await admin
      .from("bot_conexoes")
      .select("id, nome, status")
      .eq("escopo", "parceiro")
      .eq("owner_id", data.partnerId)
      .is("arquivado_em", null)
      .maybeSingle();

    const lista = (pendentes ?? []) as AvisoPendente[];
    return {
      // Sem telefone não há como avisar; separar deixa isso visível em vez de
      // sumir silenciosamente da contagem.
      comTelefone: lista.filter((a) => (a.telefone ?? "").trim().length >= 8),
      semTelefone: lista.filter((a) => (a.telefone ?? "").trim().length < 8),
      conexao: (conexao as { nome: string; status: string } | null) ?? null,
    };
  });

/**
 * Cria um disparo por marco no robô que já existe, em rascunho.
 *
 * NÃO envia. Quem envia é `dispararCampanha`, na aba Robô — e é lá que ficam as
 * proteções do chip: limite diário do número, intervalo entre mensagens e
 * deduplicação de conversa. Passar por fora disso queimaria o número da
 * academia.
 *
 * O registro em `academia_avisos` diz que o aviso foi gerado, não que chegou:
 * quem sabe disso é `bot_disparo_alvos.status`.
 */
export const prepararAvisosAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const { data: conexao } = await admin
      .from("bot_conexoes")
      .select("id, status")
      .eq("escopo", "parceiro")
      .eq("owner_id", data.partnerId)
      .is("arquivado_em", null)
      .maybeSingle();
    if (!conexao) throw new Error("Esta academia não tem conexão de WhatsApp configurada.");
    if ((conexao as { status: string }).status !== "conectado") {
      throw new Error("A conexão de WhatsApp desta academia não está conectada.");
    }

    // Toda a montagem vive em academia_avisos_preparar, no banco. O botão manual
    // e a automação diária chamam a mesma função — duas implementações
    // divergiriam, que foi exatamente o problema que a régua já teve.
    const { data: resultado, error } = await admin.rpc("academia_avisos_preparar", {
      p_partner_id: data.partnerId,
    });
    if (error) throw new Error(error.message);

    const linhas = (resultado ?? []) as Array<{ marco: string; contatos: number; disparo_id: string }>;
    return {
      ok: true,
      preparados: linhas.reduce((s, l) => s + Number(l.contatos || 0), 0),
      disparos: linhas.length,
    };
  });

/** Textos de cada marco desta academia, já com o padrão preenchido. */
export const obterModelosAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const [{ data: modelos }, { data: cfg }] = await Promise.all([
      admin.from("academia_avisos_modelos")
        .select("marco, texto, ativo").eq("partner_id", data.partnerId),
      admin.from("partner_acesso_config")
        .select("avisos_automaticos").eq("partner_id", data.partnerId).maybeSingle(),
    ]);

    const salvos = new Map(
      ((modelos ?? []) as Array<{ marco: string; texto: string; ativo: boolean }>)
        .map((m) => [m.marco, m]),
    );

    // O padrão vem do banco para não existir uma segunda cópia do texto aqui.
    const padroes = await Promise.all(
      MARCOS.map(async (marco) => {
        const { data: t } = await admin.rpc("academia_aviso_texto_padrao", { p_marco: marco });
        return [marco, String(t ?? "")] as const;
      }),
    );
    const padrao = new Map(padroes);

    return {
      automatico: Boolean((cfg as { avisos_automaticos?: boolean } | null)?.avisos_automaticos),
      modelos: MARCOS.map((marco) => ({
        marco,
        texto: salvos.get(marco)?.texto ?? padrao.get(marco) ?? "",
        ativo: salvos.get(marco)?.ativo ?? true,
        personalizado: salvos.has(marco),
      })),
    };
  });

export const salvarModelosAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; automatico: boolean;
    modelos: Array<{ marco: string; texto: string; ativo: boolean }>;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    for (const m of data.modelos) {
      const texto = (m.texto || "").trim();
      if (!texto) throw new Error(`O texto de "${ROTULO_MARCO[m.marco] ?? m.marco}" não pode ficar vazio.`);
      const { error } = await admin.from("academia_avisos_modelos").upsert(
        { partner_id: data.partnerId, marco: m.marco, texto, ativo: m.ativo, updated_at: new Date().toISOString() },
        { onConflict: "partner_id,marco" },
      );
      if (error) throw new Error(error.message);
    }

    const { error: e2 } = await admin.from("partner_acesso_config").upsert(
      { partner_id: data.partnerId, avisos_automaticos: data.automatico },
      { onConflict: "partner_id" },
    );
    if (e2) throw new Error(e2.message);

    return { ok: true };
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
