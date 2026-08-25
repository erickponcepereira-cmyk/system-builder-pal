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

  if (!profile) throw new Error("Sem acesso.");
  const profileId = (profile as { id: string }).id;

  const [{ data: membro }, { data: dono }] = await Promise.all([
    supabaseAdmin.from("partner_members").select("id").eq("partner_id", partnerId).eq("profile_id", profileId).maybeSingle(),
    supabaseAdmin.from("partners").select("id").eq("id", partnerId).eq("profile_id", profileId).maybeSingle(),
  ]);

  /*
   * Quem pode agir na academia: dono da unidade, membro da equipe, ou master
   * admin para suporte.
   *
   * Até aqui exigia `is_master_admin` ANTES de olhar o vínculo — era o gate da
   * fase de teste. Mantê-lo agora entregaria o pior sintoma que este projeto já
   * teve: a pessoa enxerga a academia na tela e leva "Sem acesso." em cada
   * clique, porque quem lista aprendeu sobre membro e quem age não.
   */
  const master = Boolean((profile as { is_master_admin?: boolean }).is_master_admin);
  if (!membro && !dono && !master) throw new Error("Sem acesso a esta academia.");

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
      .select("id, student_id, credencial_id, plano, valor, valido_ate, origem, forma_pagamento, taxa_percentual, taxa_valor, valor_liquido, created_at")
      .eq("partner_id", data.partnerId)
      // Lançamento cancelado/estornado continua no histórico financeiro, mas não
      // conta para acesso. Mesmo filtro aplicado em acesso_avaliar.
      .eq("status", "ativa")
      .order("valido_ate", { ascending: false });
    if (error) throw new Error(error.message);

    // Cast por `unknown`: o types.ts gerado ainda não tem `credencial_id` nem o
    // `student_id` anulável, que entraram na migration de 19/08. O Lovable
    // regenera esse arquivo no sync; quando regenerar, o cast direto volta a
    // bastar. O banco é a verdade aqui, não o types.ts.
    const lista = (rows ?? []) as unknown as Array<{
      id: string; student_id: string | null; credencial_id: string | null; plano: string;
      valor: number; valido_ate: string; origem: string; forma_pagamento: string;
      taxa_percentual: number; taxa_valor: number; valor_liquido: number; created_at: string;
    }>;

    /*
     * Uma linha por PESSOA — e pessoa aqui pode ser credencial do leitor, não só
     * aluno da plataforma.
     *
     * Agrupar por student_id era certo enquanto toda mensalidade tinha aluno.
     * Depois que o aluno de academia deixou de precisar ser usuário do app, 400
     * das 401 mensalidades passaram a ter student_id nulo — e todas elas
     * colapsavam numa única linha com chave nula. A tela mostrava duas pessoas
     * onde havia quatrocentas, sem dar erro nenhum.
     *
     * A mesma chave já é usada por acesso_avaliar_academia no banco. Aqui a
     * listagem só passou a segui-la.
     */
    const chaveDe = (r: { student_id: string | null; credencial_id: string | null }) =>
      r.credencial_id ?? r.student_id ?? "";
    const porPessoa = new Map<string, (typeof lista)[number]>();
    for (const r of lista) {
      const k = chaveDe(r);
      if (k && !porPessoa.has(k)) porPessoa.set(k, r);
    }

    const registros = Array.from(porPessoa.values());
    const studentIds = registros.map((r) => r.student_id).filter((x): x is string => Boolean(x));
    const credIds = registros.map((r) => r.credencial_id).filter((x): x is string => Boolean(x));

    // Nome do aluno da plataforma, quando existe.
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

    // Nome e identificador de quem só existe no leitor. Sem isto a recepção vê
    // uma lista de "Sem nome" e não consegue achar ninguém.
    const porCredencial = new Map<string, { nome: string; referencia: string }>();
    if (credIds.length > 0) {
      const { data: creds } = await admin
        .from("academia_credenciais")
        .select("id, nome_no_equipamento, referencia")
        .in("id", credIds);
      for (const c of (creds ?? []) as Array<{ id: string; nome_no_equipamento: string | null; referencia: string }>) {
        porCredencial.set(c.id, { nome: c.nome_no_equipamento?.trim() || "Sem nome no leitor", referencia: c.referencia });
      }
    }

    // A régua vive só no banco (acesso_classificar). A tela pergunta em vez de
    // recalcular, senão a listagem e a catraca podem discordar.
    const { data: avaliacoes, error: erroAval } = await admin.rpc("acesso_avaliar_academia", {
      p_partner_id: data.partnerId,
    });
    if (erroAval) throw new Error(erroAval.message);

    // Mesma chave da listagem: a régua devolve as duas pontas justamente para
    // que os dois lados casem sem inventar regra nova aqui.
    const porPessoaAval = new Map(
      // Mesmo motivo do cast acima: acesso_avaliar_academia já devolve
      // credencial_id, mas o types.ts ainda descreve a assinatura antiga.
      ((avaliacoes ?? []) as unknown as Array<{
        student_id: string | null; credencial_id: string | null;
        decisao: string; motivo: string; dias_restantes: number | null;
      }>).map((a) => [chaveDe(a), a]),
    );

    return {
      carencia,
      alunos: registros.map((r) => {
        const aval = porPessoaAval.get(chaveDe(r));
        const cred = r.credencial_id ? porCredencial.get(r.credencial_id) : undefined;
        return {
          ...r,
          nome: (r.student_id ? nomes.get(r.student_id) : undefined) ?? cred?.nome ?? "Sem nome",
          // O identificador do leitor é o que a recepção usa para liberar na mão
          // e para cadastrar rosto. Sem ele na tela, a pessoa existe e ninguém
          // consegue agir sobre ela.
          referencia: cred?.referencia ?? null,
          dias_restantes: aval?.dias_restantes ?? null,
          decisao: aval?.decisao ?? "negado",
          motivo: aval?.motivo ?? "sem_mensalidade",
        };
      }),
    };
  });

/**
 * Busca de aluno para vincular, ISOLADA POR ACADEMIA.
 *
 * Por nome, só encontra quem já tem relação com esta unidade. Para trazer
 * alguém de fora, exige CPF ou e-mail completo — que só quem está na frente do
 * balcão consegue informar.
 *
 * A versão anterior varria todos os alunos da plataforma: num SaaS isso mostra
 * gente de outras academias e de outros coaches para quem não tem nada a ver
 * com eles.
 */
export const buscarAlunosParaMensalidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; termo: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const termo = (data.termo || "").trim();
    if (termo.length < 3) return { alunos: [] as Array<{ studentId: string; nome: string }> };

    const { data: linhas, error } = await admin.rpc("academia_buscar_aluno", {
      p_partner_id: data.partnerId,
      p_termo: termo,
    });
    if (error) throw new Error(error.message);

    return {
      alunos: ((linhas ?? []) as Array<{ student_id: string; nome: string }>).map((l) => ({
        studentId: l.student_id,
        nome: l.nome,
      })),
    };
  });

/**
 * Busca de PESSOA (não só de aluno da plataforma).
 *
 * A recepção não sabe — nem precisa saber — se quem está no balcão tem conta na
 * FitMind. A maioria só existe como credencial do leitor, e a busca antiga
 * simplesmente não achava essas pessoas, o que tornava impossível lançar a
 * mensalidade delas por esta aba.
 *
 * Devolve junto o vencimento vigente, porque é ele (e não a data de hoje) que
 * define a nova validade de quem renova adiantado.
 */
export type PessoaAcademia = {
  credencialId: string | null;
  studentId: string | null;
  nome: string;
  referencia: string | null;
  validoAte: string | null;
};

export const buscarPessoasAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; termo: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const termo = (data.termo || "").trim();
    if (termo.length < 3) return { pessoas: [] as PessoaAcademia[] };

    const pessoas: PessoaAcademia[] = [];

    // 1) Credenciais da unidade (inclui quem não é da FitMind).
    const like = `%${termo}%`;
    const { data: creds } = await admin
      .from("academia_credenciais")
      .select("id, student_id, nome_no_equipamento, referencia, telefone")
      .eq("partner_id", data.partnerId)
      .eq("ativo", true)
      .or(`nome_no_equipamento.ilike.${like},referencia.ilike.${like},telefone.ilike.${like}`)
      .limit(20);

    for (const c of (creds ?? []) as Array<{
      id: string; student_id: string | null; nome_no_equipamento: string | null;
      referencia: string | null; telefone: string | null;
    }>) {
      pessoas.push({
        credencialId: c.id,
        studentId: c.student_id,
        nome: c.nome_no_equipamento || "Sem nome",
        referencia: c.referencia,
        validoAte: null,
      });
    }

    // 2) Alunos da plataforma ligados a esta unidade, sem duplicar quem já veio
    //    pela credencial.
    const { data: alunos } = await admin.rpc("academia_buscar_aluno", {
      p_partner_id: data.partnerId,
      p_termo: termo,
    });
    const jaTem = new Set(pessoas.map((p) => p.studentId).filter(Boolean) as string[]);
    for (const a of (alunos ?? []) as Array<{ student_id: string; nome: string }>) {
      if (jaTem.has(a.student_id)) continue;
      pessoas.push({
        credencialId: null,
        studentId: a.student_id,
        nome: a.nome,
        referencia: null,
        validoAte: null,
      });
    }

    // 3) Vencimento vigente de cada um.
    const credIds = pessoas.map((p) => p.credencialId).filter(Boolean) as string[];
    const studIds = pessoas.map((p) => p.studentId).filter(Boolean) as string[];
    if (credIds.length || studIds.length) {
      const filtros: string[] = [];
      if (credIds.length) filtros.push(`credencial_id.in.(${credIds.join(",")})`);
      if (studIds.length) filtros.push(`student_id.in.(${studIds.join(",")})`);
      const { data: mens } = await admin
        .from("academia_mensalidades")
        .select("credencial_id, student_id, valido_ate")
        .eq("partner_id", data.partnerId)
        .eq("status", "ativa")
        .or(filtros.join(","));
      for (const m of (mens ?? []) as Array<{
        credencial_id: string | null; student_id: string | null; valido_ate: string;
      }>) {
        for (const p of pessoas) {
          const bate =
            (m.credencial_id && p.credencialId === m.credencial_id) ||
            (m.student_id && p.studentId === m.student_id);
          if (bate && (!p.validoAte || m.valido_ate > p.validoAte)) p.validoAte = m.valido_ate;
        }
      }
    }

    return { pessoas: pessoas.slice(0, 25) };
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

export const POLITICAS_RENOVACAO = [
  { value: "justa", label: "Em dia soma no fim do plano; vencido conta do pagamento" },
  { value: "vencimento", label: "Sempre a partir do vencimento anterior" },
  { value: "pagamento", label: "Sempre a partir do dia do pagamento" },
] as const;

/** Produtos da loja que liberam mensalidade nesta academia. */
export const obterProdutosMensalidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const { data: vinculos } = await admin
      .from("academia_produtos_mensalidade")
      .select("id, product_id, plano, dias_validade, politica_renovacao, ativo")
      .eq("partner_id", data.partnerId);

    const ids = ((vinculos ?? []) as Array<{ product_id: string }>).map((v) => v.product_id);
    const { data: nomes } = ids.length
      ? await admin.from("products").select("id, name").in("id", ids)
      : { data: [] };

    return {
      vinculos: (vinculos ?? []) as Array<{
        id: string; product_id: string; plano: string;
        dias_validade: number; politica_renovacao: string; ativo: boolean;
      }>,
      nomes: Object.fromEntries(
        ((nomes ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]),
      ),
    };
  });

export const buscarProdutosParaVincular = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; termo: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const termo = (data.termo || "").trim();
    if (termo.length < 3) return { produtos: [] as Array<{ id: string; name: string }> };

    const { data: produtos } = await admin
      .from("products").select("id, name").ilike("name", `%${termo}%`).limit(20);
    return { produtos: (produtos ?? []) as Array<{ id: string; name: string }> };
  });

export const salvarProdutoMensalidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; productId: string; plano: string;
    diasValidade: number; politica: string; ativo: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    if (!Number.isFinite(data.diasValidade) || data.diasValidade < 1) {
      throw new Error("Informe quantos dias a mensalidade vale.");
    }
    const { error } = await admin.from("academia_produtos_mensalidade").upsert(
      {
        partner_id: data.partnerId,
        product_id: data.productId,
        plano: (data.plano || "Mensalidade").trim(),
        dias_validade: Math.floor(data.diasValidade),
        politica_renovacao: data.politica,
        ativo: data.ativo,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "partner_id,product_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Rede de segurança: compra confirmada que ficou sem mensalidade. */
export const reprocessarMensalidadesPendentes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: n, error } = await admin.rpc("academia_mensalidades_pendentes_reprocessar", {
      p_partner_id: data.partnerId,
    });
    if (error) throw new Error(error.message);
    return { geradas: Number(n ?? 0) };
  });

export const obterAgenteAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const [{ data: agentes }, { data: negados }, { data: entradas }, { data: credenciais }] =
      await Promise.all([
        admin.from("academia_agentes")
          .select("id, nome, codigo_pareamento, codigo_expira_em, pareado_em, ultimo_contato_em, ultima_sync_em, versao, ativo")
          .eq("partner_id", data.partnerId).order("created_at", { ascending: false }),
        admin.from("academia_acessos_negados")
          .select("id, referencia, motivo, origem, tentado_em")
          .eq("partner_id", data.partnerId).order("tentado_em", { ascending: false }).limit(20),
        admin.from("academia_frequencias")
          .select("id, student_id, origem, entrada_em")
          .eq("partner_id", data.partnerId).order("entrada_em", { ascending: false }).limit(20),
        admin.from("academia_credenciais")
          .select("id, student_id, tipo, referencia, ativo")
          .eq("partner_id", data.partnerId).eq("ativo", true),
      ]);

    // Nomes só para a tela da academia. O agente nunca recebe isto.
    const ids = Array.from(new Set([
      ...((entradas ?? []) as Array<{ student_id: string }>).map((e) => e.student_id),
      ...((credenciais ?? []) as Array<{ student_id: string | null }>).map((c) => c.student_id).filter(Boolean) as string[],
    ]));
    const nomes = new Map<string, string>();
    if (ids.length) {
      const { data: studs } = await admin.from("students").select("id, profile_id").in("id", ids);
      const profIds = ((studs ?? []) as Array<{ profile_id: string }>).map((s) => s.profile_id);
      const { data: profs } = await admin.from("profiles").select("id, name").in("id", profIds);
      const mapProf = new Map(((profs ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, p.name ?? "Sem nome"]));
      for (const s of (studs ?? []) as Array<{ id: string; profile_id: string }>) {
        nomes.set(s.id, mapProf.get(s.profile_id) ?? "Sem nome");
      }
    }

    return {
      agentes: (agentes ?? []) as Array<{
        id: string; nome: string; codigo_pareamento: string | null; codigo_expira_em: string | null;
        pareado_em: string | null; ultimo_contato_em: string | null; ultima_sync_em: string | null;
        versao: string | null; ativo: boolean;
      }>,
      negados: (negados ?? []) as Array<{
        id: string; referencia: string | null; motivo: string; origem: string; tentado_em: string;
      }>,
      entradas: ((entradas ?? []) as Array<{ id: string; student_id: string; origem: string; entrada_em: string }>)
        .map((e) => ({ ...e, nome: nomes.get(e.student_id) ?? "Sem nome" })),
      credenciais: ((credenciais ?? []) as Array<{ id: string; student_id: string | null; tipo: string; referencia: string }>)
        .map((c) => ({ ...c, nome: c.student_id ? (nomes.get(c.student_id) ?? "Sem nome") : "Sem vínculo" })),
    };
  });

export const gerarCodigoAgente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; nome?: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_agente_gerar_codigo", {
      p_partner_id: data.partnerId,
      p_nome: data.nome ?? "",
    });
    if (error) throw new Error(error.message);
    const linha = ((r ?? []) as Array<{ agente_id: string; codigo: string; expira_em: string }>)[0];
    if (!linha) throw new Error("Não foi possível gerar o código.");
    return linha;
  });

/** Credenciais lidas do leitor que ainda não têm aluno, com sugestões por nome. */
export const obterCredenciaisSemVinculo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const { data: pendentes } = await admin
      .from("academia_credenciais")
      .select("id, referencia, nome_no_equipamento, importado_em")
      .eq("partner_id", data.partnerId)
      .is("student_id", null)
      .eq("ativo", true)
      .order("nome_no_equipamento");

    const lista = (pendentes ?? []) as Array<{
      id: string; referencia: string; nome_no_equipamento: string | null; importado_em: string | null;
    }>;

    // Sugestão por semelhança de nome. Não vincula nada: só ordena candidatos,
    // porque vínculo errado manda a pessoa errada para dentro da academia.
    const comSugestoes = await Promise.all(
      lista.slice(0, 60).map(async (c) => {
        const { data: s } = await admin.rpc("academia_credencial_sugestoes", {
          p_partner_id: data.partnerId,
          p_credencial_id: c.id,
        });
        return {
          ...c,
          sugestoes: (s ?? []) as Array<{ student_id: string; nome: string; semelhanca: number }>,
        };
      }),
    );

    return { pendentes: comSugestoes, total: lista.length };
  });

export const vincularCredencial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; studentId: string; tipo: string; referencia: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const ref = (data.referencia || "").trim();
    if (!ref) throw new Error("Informe o identificador do equipamento.");

    // Um mesmo aluno não pode ficar com duas credenciais do mesmo tipo nesta
    // academia: duas faces para a mesma pessoa viram frequência duplicada.
    const { data: jaTem } = await admin
      .from("academia_credenciais")
      .select("referencia")
      .eq("partner_id", data.partnerId)
      .eq("tipo", data.tipo)
      .eq("student_id", data.studentId)
      .neq("referencia", ref)
      .maybeSingle();
    if (jaTem) {
      throw new Error(
        `Este aluno já está vinculado ao identificador ${(jaTem as { referencia: string }).referencia}. Desvincule antes de ligar outro.`,
      );
    }

    const { error } = await admin.from("academia_credenciais").upsert(
      { partner_id: data.partnerId, student_id: data.studentId, tipo: data.tipo, referencia: ref, ativo: true },
      { onConflict: "partner_id,tipo,referencia" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Enfileira uma foto para o agente gravar no leitor.
 *
 * É o que evita ir até a academia para cada aluno novo. A foto fica na fila só
 * até o agente confirmar que gravou — nesse momento ela é apagada, porque o
 * lugar da biometria é o equipamento, não este banco.
 */
export const enviarFoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; studentId: string; nome: string; fotoBase64: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const b64 = String(data.fotoBase64 || "").replace(/^data:[^;]+;base64,/, "");
    if (b64.length < 1000) throw new Error("Foto ausente ou pequena demais.");
    // ~1,4 MB de JPEG. Acima disso o leitor costuma recusar mesmo.
    if (b64.length > 2_000_000) throw new Error("Foto muito grande. Use uma imagem menor.");

    const { data: r, error } = await admin.rpc("academia_face_enfileirar", {
      p_partner_id: data.partnerId,
      p_student_id: data.studentId,
      p_nome: (data.nome || "").trim().slice(0, 60),
      p_foto_base64: b64,
    });
    if (error) throw new Error(error.message);
    const linha = ((r ?? []) as Array<{ envio_id: string; referencia: string }>)[0];
    return { ok: true, referencia: linha?.referencia ?? null };
  });

/** Fotos na fila, para a recepção acompanhar. */
export const obterFilaDeFotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: fila } = await admin
      .from("academia_faces_envio")
      .select("id, nome, referencia, status, erro, criado_em, enviado_em")
      .eq("partner_id", data.partnerId)
      .order("criado_em", { ascending: false })
      .limit(20);
    return { fila: (fila ?? []) as Array<{
      id: string; nome: string; referencia: string; status: string;
      erro: string | null; criado_em: string; enviado_em: string | null;
    }> };
  });

export const desvincularCredencial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; credencialId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    // Solta o vínculo, não apaga a credencial: o rosto continua no leitor.
    const { error } = await admin.from("academia_credenciais")
      .update({ student_id: null })
      .eq("id", data.credencialId)
      .eq("partner_id", data.partnerId);
    if (error) throw new Error(error.message);
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

/* ------------------------------------------------------------------ *
 * Planos e renovação
 *
 * A renovação é a operação mais comum de uma academia e era a única
 * impossível pela tela: registrarMensalidadeAcademia exige studentId, e 400
 * das 401 pessoas só existem como credencial do leitor.
 * ------------------------------------------------------------------ */

/** Preços de tabela da academia. O valor é sugestão, editável na venda. */
export const listarPlanosAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: linhas, error } = await admin
      .from("academia_planos" as never)
      .select("id, nome, valor_padrao, dias" as never)
      .eq("partner_id" as never, data.partnerId)
      .eq("ativo" as never, true)
      .order("posicao" as never, { ascending: true });
    if (error) throw new Error(error.message);
    return {
      planos: (linhas ?? []) as unknown as Array<{
        id: string; nome: string; valor_padrao: number; dias: number;
      }>,
    };
  });

export type PagamentoDividido = { forma: FormaPagamento; valor: number };

/**
 * Lança ou renova, com o pagamento dividido entre formas.
 *
 * A conta fica no banco (`academia_renovar`), uma vez só: a taxa é por forma,
 * e a data nova soma em cima do vencimento atual quando ele ainda está no
 * futuro. Fazer isso aqui em TypeScript seria a quarta duplicação de régua
 * deste projeto.
 */
export const renovarMensalidadeAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; credencialId?: string | null; studentId?: string | null;
    plano: string; dias: number; pagamentos: PagamentoDividido[]; observacao?: string;
    /** Validade escolhida na mão; quando ausente, o banco soma os dias do plano. */
    validoAte?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin, profileId } = await autorizar(context.userId, data.partnerId);

    const pagamentos = (data.pagamentos ?? [])
      .map((p) => ({ forma: p.forma, valor: Math.round((Number(p.valor) || 0) * 100) / 100 }))
      .filter((p) => p.valor > 0);
    if (pagamentos.length === 0) throw new Error("Informe ao menos uma forma de pagamento com valor.");
    if (!data.credencialId && !data.studentId) throw new Error("Informe a pessoa.");

    const total = pagamentos.reduce((s, p) => s + p.valor, 0);

    const { data: r, error } = await admin.rpc("academia_renovar" as never, {
      p_partner_id: data.partnerId,
      p_credencial_id: data.credencialId ?? null,
      p_student_id: data.studentId ?? null,
      p_plano: data.plano,
      p_valor: total,
      p_pagamentos: pagamentos,
      p_dias: Number(data.dias) || 30,
      p_registrado_por: profileId,
      p_observacao: data.observacao ?? null,
      p_valido_ate: data.validoAte || null,
    } as never);

    if (error) throw new Error(error.message);

    const linha = (Array.isArray(r) ? r[0] : r) as unknown as {
      mensalidade_id: string; valido_ate: string; bruto: number; taxas: number; liquido: number;
    };
    return linha;
  });

/**
 * Relatório da academia.
 *
 * O faturamento dela não aparecia em lugar nenhum: `academia_mensalidades` só
 * era lido pelo próprio painel, e os relatórios do parceiro nunca souberam que
 * a academia existe. Os números vêm todos de `academia_relatorio`, que usa a
 * mesma régua da catraca — se a tela e a catraca discordassem sobre quem está
 * liberado, o relatório seria pior que não ter relatório.
 */
export const relatorioAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; de?: string; ate?: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_relatorio" as never, {
      p_partner_id: data.partnerId,
      p_de: data.de ?? null,
      p_ate: data.ate ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return r as unknown as {
      periodo: { de: string; ate: string; hoje: string };
      financeiro: { lancamentos: number; bruto: number; taxas: number; liquido: number };
      por_forma: Array<{ forma: string; bruto: number; taxas: number; liquido: number }>;
      por_plano: Array<{ plano: string; vendas: number; bruto: number }>;
      situacao: { liberados: number; em_carencia: number; a_vencer: number; bloqueados: number; total_com_mensalidade: number };
      sem_mensalidade: number;
      vencem_em_7: number;
      frequencia: { entradas: number; pessoas: number; manuais: number };
      negados: number;
    };
  });

/**
 * Cadastro local de quem não é da FitMind.
 *
 * A recepção precisa lançar mensalidade para gente que nunca vai criar conta.
 * Isso vira uma credencial da própria academia (sem `student_id`), com nome,
 * telefone e nascimento — o suficiente para achar a pessoa depois e para
 * cadastrar o rosto no leitor. Não cria usuário, não manda e-mail.
 */
export const cadastrarPessoaAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; nome: string; telefone: string; nascimento: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const nome = (data.nome || "").trim().replace(/\s+/g, " ");
    if (nome.length < 3) throw new Error("Informe o nome completo.");

    const telefone = (data.telefone || "").replace(/\D/g, "");
    if (telefone.length < 10 || telefone.length > 11) throw new Error("Telefone inválido (DDD + número).");

    const nascimento = (data.nascimento || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) throw new Error("Informe a data de nascimento.");
    const nasc = new Date(`${nascimento}T12:00:00`);
    const anos = (Date.now() - nasc.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (!Number.isFinite(anos) || anos < 3 || anos > 110) throw new Error("Data de nascimento inválida.");

    // Mesmo telefone na mesma academia é a mesma pessoa. Duplicar aqui
    // significa duas fichas e duas mensalidades para quem paga uma.
    const { data: existente } = await admin
      .from("academia_credenciais")
      .select("id, referencia, nome_no_equipamento")
      .eq("partner_id", data.partnerId)
      .eq("telefone", telefone)
      .eq("ativo", true)
      .maybeSingle();
    if (existente) {
      const e = existente as { id: string; referencia: string; nome_no_equipamento: string | null };
      return { credencialId: e.id, referencia: e.referencia, nome: e.nome_no_equipamento ?? nome, jaExistia: true };
    }

    // Identificador numérico livre: é o que a recepção digita para liberar na
    // mão e o que amarra o rosto depois.
    const { data: usados } = await admin
      .from("academia_credenciais")
      .select("referencia")
      .eq("partner_id", data.partnerId)
      .eq("tipo", "pin");
    const ocupados = new Set(((usados ?? []) as Array<{ referencia: string }>).map((u) => u.referencia));

    let referencia = "";
    for (let i = 0; i < 200 && !referencia; i++) {
      const candidato = String(Math.floor(100000 + Math.random() * 900000));
      if (!ocupados.has(candidato)) referencia = candidato;
    }
    if (!referencia) throw new Error("Não consegui gerar um identificador. Tente de novo.");

    const { data: criada, error } = await admin
      .from("academia_credenciais")
      .insert({
        partner_id: data.partnerId,
        student_id: null,
        tipo: "pin",
        referencia,
        ativo: true,
        nome_no_equipamento: nome,
        telefone,
        nascimento,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { credencialId: (criada as { id: string }).id, referencia, nome, jaExistia: false };
  });
