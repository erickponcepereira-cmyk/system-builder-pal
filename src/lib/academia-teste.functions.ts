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

export const TIPOS_DAYUSE = [
  { value: "day_use", label: "Day-use" },
  { value: "aula_experimental", label: "Aula experimental" },
  { value: "cortesia", label: "Cortesia" },
] as const;

export const MOTIVO_DAYUSE: Record<string, string> = {
  dayuse_permitido: "Pode entrar",
  ja_usou: "Este CPF já usou o day-use nesta academia",
  ja_usou_no_mes: "Este CPF já usou o day-use neste mês",
  dayuse_desativado: "Esta academia não oferece day-use",
  cpf_invalido: "CPF incompleto",
};

/** Consulta a regra da academia sem registrar nada. */
export const avaliarDayUse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; cpf: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_dayuse_avaliar", {
      p_partner_id: data.partnerId,
      p_cpf: data.cpf,
    });
    if (error) throw new Error(error.message);
    const linha = ((r ?? []) as Array<{
      decisao: string; motivo: string; usos: number; ultimo_uso: string | null;
    }>)[0];
    return linha ?? { decisao: "negado", motivo: "cpf_invalido", usos: 0, ultimo_uso: null };
  });

export const registrarDayUse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; cpf: string; nome: string; telefone?: string;
    tipo: string; valor: number; formaPagamento?: FormaPagamento; observacao?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin, profileId } = await autorizar(context.userId, data.partnerId);

    const nome = (data.nome || "").trim();
    if (nome.length < 3) throw new Error("Informe o nome de quem vai entrar.");

    const valor = Number(data.valor) || 0;
    // Day-use pago usa exatamente a mesma conta de taxa da mensalidade, e
    // sempre como venda externa: quem recebeu foi a recepção da academia.
    const taxa = valor > 0 && data.formaPagamento
      ? await calcularTaxa(admin, data.partnerId, "externa", data.formaPagamento, valor)
      : { taxaPercentual: 0, taxaValor: 0, valorLiquido: valor, fonte: "dinheiro" as const };

    // A regra é reavaliada dentro da função do banco: duas recepcionistas
    // clicando ao mesmo tempo não passam as duas.
    const { data: id, error } = await admin.rpc("academia_dayuse_registrar", {
      p_partner_id: data.partnerId,
      p_cpf: data.cpf,
      p_nome: nome,
      p_telefone: data.telefone ?? null,
      p_tipo: data.tipo,
      p_valor: valor,
      p_forma_pagamento: valor > 0 ? (data.formaPagamento ?? null) : null,
      p_taxa_percentual: taxa.taxaPercentual,
      p_taxa_valor: taxa.taxaValor,
      p_valor_liquido: taxa.valorLiquido,
      p_liberado_por: profileId,
      p_observacao: data.observacao ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true, id: id as unknown as string, ...taxa };
  });

export const GATILHOS_CRM = [
  { value: "vencimento_proximo", label: "Vencimento próximo (3 dias ou menos)" },
  { value: "em_carencia", label: "Em carência (já venceu, ainda entra)" },
  { value: "vencido_bloqueado", label: "Bloqueado por inadimplência" },
] as const;

/** Funis e colunas da academia, mais as regras já salvas. */
export const obterCrmAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const { data: quadros } = await admin
      .from("crm_quadros")
      .select("id, nome")
      .eq("escopo", "parceiro")
      .eq("owner_id", data.partnerId)
      .is("arquivado_em", null)
      .order("created_at");

    const ids = ((quadros ?? []) as Array<{ id: string }>).map((q) => q.id);
    const { data: colunas } = ids.length
      ? await admin.from("crm_colunas").select("id, quadro_id, nome, posicao").in("quadro_id", ids).order("posicao")
      : { data: [] };

    const [{ data: regras }, { data: varios }] = await Promise.all([
      admin.from("academia_crm_regras")
        .select("gatilho, quadro_id, coluna_id, ativo").eq("partner_id", data.partnerId),
      admin.rpc("academia_crm_em_varios_funis", { p_partner_id: data.partnerId }),
    ]);

    return {
      quadros: (quadros ?? []) as Array<{ id: string; nome: string }>,
      colunas: (colunas ?? []) as Array<{ id: string; quadro_id: string; nome: string }>,
      regras: (regras ?? []) as Array<{ gatilho: string; quadro_id: string; coluna_id: string; ativo: boolean }>,
      // Não é erro: a academia decide. Só precisa enxergar.
      emVariosFunis: (varios ?? []) as Array<{ nome: string; funis: number; quadros: string }>,
    };
  });

export const salvarRegraCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; gatilho: string;
    quadroId: string | null; colunaId: string | null; ativo: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    // Sem funil escolhido a regra deixa de existir, em vez de ficar meio salva.
    if (!data.quadroId || !data.colunaId) {
      const { error } = await admin.from("academia_crm_regras")
        .delete().eq("partner_id", data.partnerId).eq("gatilho", data.gatilho);
      if (error) throw new Error(error.message);
      return { ok: true, removida: true };
    }

    const { error } = await admin.from("academia_crm_regras").upsert(
      {
        partner_id: data.partnerId, gatilho: data.gatilho,
        quadro_id: data.quadroId, coluna_id: data.colunaId,
        ativo: data.ativo, updated_at: new Date().toISOString(),
      },
      { onConflict: "partner_id,gatilho" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, removida: false };
  });

export const sincronizarCrmAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_crm_sincronizar", {
      p_partner_id: data.partnerId,
    });
    if (error) throw new Error(error.message);
    const linhas = (r ?? []) as Array<{ gatilho: string; criados: number; assumidos: number }>;
    return {
      criados: linhas.reduce((s, l) => s + Number(l.criados || 0), 0),
      // Ficaram de fora porque a equipe moveu o cartão: já estão sendo tratados.
      assumidos: linhas.reduce((s, l) => s + Number(l.assumidos || 0), 0),
      porGatilho: linhas,
    };
  });

/** Treinos do aluno + modelos disponíveis + de quem é o aluno. */
export const obterTreinosAluno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; studentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const [{ data: planos, error }, { data: modelos }] = await Promise.all([
      admin.rpc("academia_treinos_do_aluno", {
        p_partner_id: data.partnerId,
        p_student_id: data.studentId,
      }),
      admin.from("workout_templates")
        .select("id, name, goal, level")
        .eq("is_active", true)
        .eq("is_global", true)
        .order("name"),
    ]);
    if (error) throw new Error(error.message);

    return {
      planos: (planos ?? []) as Array<{
        plano_id: string; nome: string; dia_semana: number | null; ativo: boolean;
        criado_em: string; exercicios: number; montado_por_nome: string; coach_do_aluno: string;
      }>,
      modelos: (modelos ?? []) as Array<{ id: string; name: string; goal: string; level: string | null }>,
    };
  });

export const aplicarModeloTreino = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; studentId: string; templateId: string;
    nome?: string; diaSemana?: number | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin, profileId } = await autorizar(context.userId, data.partnerId);

    const { data: id, error } = await admin.rpc("academia_treino_do_modelo", {
      p_partner_id: data.partnerId,
      p_student_id: data.studentId,
      p_template_id: data.templateId,
      p_montado_por: profileId,
      p_nome: data.nome ?? "",
      p_dia: data.diaSemana ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true, planoId: id as unknown as string };
  });

export const OPCOES_VALIDACAO = [
  { value: "catraca", label: "Só catraca" },
  { value: "qrcode", label: "Só QR code" },
  { value: "ambos", label: "Catraca e QR code" },
] as const;

export const OPCOES_CONTA = [
  { value: "dia", label: "Por dia — duas entradas no mesmo dia contam 1" },
  { value: "entrada", label: "Por entrada — cada passagem conta 1" },
] as const;

export const OPCOES_PERIODO = [
  { value: "vitalicio", label: "Vitalício — nunca zera" },
  { value: "anual", label: "Zera todo ano" },
  { value: "mensal", label: "Zera todo mês" },
] as const;

export const obterFrequenciaAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; desde?: string | null; turmaId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const [{ data: linhas, error }, { data: turmas }, { data: cfg }] = await Promise.all([
      admin.rpc("academia_frequencia_relatorio", {
        p_partner_id: data.partnerId,
        p_desde: data.desde ?? undefined,
        p_turma_id: data.turmaId ?? undefined,
      }),
      admin.from("academia_turmas")
        .select("id, nome, modalidade, dia_semana, hora_inicio, hora_fim")
        .eq("partner_id", data.partnerId).eq("ativo", true).order("nome"),
      admin.from("partner_acesso_config")
        .select("validacao_frequencia, frequencia_conta, frequencia_periodo, frequencia_meta")
        .eq("partner_id", data.partnerId).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);

    return {
      linhas: (linhas ?? []) as Array<{
        student_id: string; nome: string; visitas: number; dias: number;
        minutos_medios: number; ultima: string | null; repetiu_hoje: boolean;
      }>,
      turmas: (turmas ?? []) as Array<{ id: string; nome: string; modalidade: string | null }>,
      config: (cfg as null | {
        validacao_frequencia: string; frequencia_conta: string;
        frequencia_periodo: string; frequencia_meta: number | null;
      }) ?? {
        validacao_frequencia: "catraca", frequencia_conta: "dia",
        frequencia_periodo: "vitalicio", frequencia_meta: null,
      },
    };
  });

export const salvarConfigFrequencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; validacao: string; conta: string; periodo: string; meta: number | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { error } = await admin.from("partner_acesso_config").upsert(
      {
        partner_id: data.partnerId,
        validacao_frequencia: data.validacao,
        frequencia_conta: data.conta,
        frequencia_periodo: data.periodo,
        frequencia_meta: data.meta,
      },
      { onConflict: "partner_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const salvarTurma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; nome: string; modalidade?: string;
    diaSemana?: number | null; horaInicio?: string | null; horaFim?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const nome = (data.nome || "").trim();
    if (nome.length < 2) throw new Error("Informe o nome da turma.");

    const { error } = await admin.from("academia_turmas").insert({
      partner_id: data.partnerId,
      nome,
      modalidade: data.modalidade?.trim() || null,
      dia_semana: data.diaSemana ?? null,
      hora_inicio: data.horaInicio || null,
      hora_fim: data.horaFim || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const OPCOES_ACESSO_EVENTO = [
  { value: "qrcode", label: "QR code" },
  { value: "facial", label: "Reconhecimento facial" },
  { value: "ambos", label: "QR ou facial" },
] as const;

export const OPCOES_FACE = [
  { value: "uma_leitura", label: "Apagar o rosto assim que entrar" },
  { value: "apagar_24h", label: "Apagar o rosto em 24 horas" },
] as const;

export const MOTIVO_EVENTO: Record<string, string> = {
  entrada_liberada: "Entrada liberada",
  credencial_invalida: "Credencial não encontrada",
  ja_utilizada: "Esta credencial já foi usada",
  fora_da_data: "Credencial de outra data",
};

export const obterEventosAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const [{ data: eventos }, { data: faces }] = await Promise.all([
      admin.from("academia_eventos")
        .select("id, nome, data_evento, hora_inicio, valor, acesso, face_politica, ativo")
        .eq("partner_id", data.partnerId).order("data_evento", { ascending: false }).limit(30),
      admin.rpc("academia_faces_a_remover", { p_partner_id: data.partnerId }),
    ]);

    const ids = ((eventos ?? []) as Array<{ id: string }>).map((e) => e.id);
    const { data: inscricoes } = ids.length
      ? await admin.from("academia_evento_inscricoes")
          .select("id, evento_id, nome, credencial, usado_em, valor").in("evento_id", ids)
      : { data: [] };

    return {
      eventos: (eventos ?? []) as Array<{
        id: string; nome: string; data_evento: string; hora_inicio: string | null;
        valor: number; acesso: string; face_politica: string; ativo: boolean;
      }>,
      inscricoes: (inscricoes ?? []) as Array<{
        id: string; evento_id: string; nome: string; credencial: string;
        usado_em: string | null; valor: number;
      }>,
      facesPendentes: (faces ?? []) as Array<{
        inscricao_id: string; nome: string; evento: string; politica: string; vencido_desde: string | null;
      }>,
    };
  });

export const criarEventoAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; nome: string; data: string; hora?: string | null;
    valor: number; acesso: string; facePolitica: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const nome = (data.nome || "").trim();
    if (nome.length < 3) throw new Error("Informe o nome do evento.");
    if (!data.data) throw new Error("Informe a data do evento.");

    const { error } = await admin.from("academia_eventos").insert({
      partner_id: data.partnerId,
      nome,
      data_evento: data.data,
      hora_inicio: data.hora || null,
      valor: Number(data.valor) || 0,
      acesso: data.acesso,
      face_politica: data.facePolitica,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const inscreverNoEvento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; eventoId: string; nome: string; cpf?: string;
    telefone?: string; valor: number; formaPagamento?: FormaPagamento;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const nome = (data.nome || "").trim();
    if (nome.length < 3) throw new Error("Informe o nome do participante.");

    const valor = Number(data.valor) || 0;
    const taxa = valor > 0 && data.formaPagamento
      ? await calcularTaxa(admin, data.partnerId, "externa", data.formaPagamento, valor)
      : { taxaPercentual: 0, taxaValor: 0, valorLiquido: valor };

    const digitos = (data.cpf || "").replace(/\D/g, "");
    let cpfHash: string | null = null;
    if (digitos.length === 11) {
      const { data: h } = await admin.rpc("academia_cpf_hash", {
        p_partner_id: data.partnerId, p_cpf: digitos,
      });
      cpfHash = (h as unknown as string) ?? null;
    }

    const { data: row, error } = await admin.from("academia_evento_inscricoes").insert({
      evento_id: data.eventoId,
      partner_id: data.partnerId,
      nome,
      cpf_hash: cpfHash,
      cpf_final: digitos ? digitos.slice(-3) : null,
      telefone: data.telefone?.trim() || null,
      valor,
      forma_pagamento: valor > 0 ? (data.formaPagamento ?? null) : null,
      taxa_percentual: taxa.taxaPercentual,
      taxa_valor: taxa.taxaValor,
      valor_liquido: taxa.valorLiquido,
    }).select("credencial").single();
    if (error) throw new Error(error.message);

    return { ok: true, credencial: (row as { credencial: string }).credencial };
  });

export const validarCredencialEvento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; credencial: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_evento_validar", {
      p_partner_id: data.partnerId,
      p_credencial: data.credencial,
    });
    if (error) throw new Error(error.message);
    const linha = ((r ?? []) as Array<{
      decisao: string; motivo: string; nome: string | null; evento: string | null;
    }>)[0];
    return linha ?? { decisao: "negado", motivo: "credencial_invalida", nome: null, evento: null };
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
