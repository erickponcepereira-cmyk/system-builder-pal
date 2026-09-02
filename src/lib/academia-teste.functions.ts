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
  const { perfilComAcessoAcademia } = await import("./academia-acesso.server");

  /*
   * A régua (dono, membro ou master admin) mora em academia-acesso.server
   * porque a rota de download da instalação precisa da mesma, e ela não passa
   * por este middleware de sessão. Duas cópias da regra é como um lado aprende
   * sobre membro e o outro não.
   */
  const profileId = await perfilComAcessoAcademia(userId, partnerId);
  if (!profileId) throw new Error("Sem acesso a esta academia.");

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
    const porCredencial = new Map<string, { nome: string; referencia: string; noLeitor: boolean }>();
    if (credIds.length > 0) {
      const { data: creds } = await admin
        .from("academia_credenciais")
        .select("id, nome_no_equipamento, referencia, importado_em")
        .in("id", credIds);
      for (const c of (creds ?? []) as unknown as Array<{
        id: string; nome_no_equipamento: string | null; referencia: string; importado_em: string | null;
      }>) {
        porCredencial.set(c.id, {
          nome: c.nome_no_equipamento?.trim() || "Sem nome no leitor",
          referencia: c.referencia,
          // `importado_em` só é preenchido quando a pessoa foi LIDA do leitor.
          // Quem foi cadastrado na recepção e ainda não teve rosto capturado
          // não existe no equipamento — e sem existir lá, o leitor nunca vai
          // reportar o id dela, então a catraca nunca abre. A mensalidade pode
          // estar em dia e a pessoa continuar parada na porta.
          noLeitor: c.importado_em !== null,
        });
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
          // Aluno da plataforma sem credencial não depende do leitor; quem tem
          // credencial depende, e a tela precisa avisar quando falta o rosto.
          sem_rosto_no_leitor: Boolean(r.credencial_id) && !(cred?.noLeitor ?? false),
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
/**
 * Corrige um lançamento já feito: valor, forma de pagamento e vencimento.
 *
 * Cancelar e lançar de novo parece equivalente e não é: o cancelamento some da
 * lista de ativos, e quem estava liberado pela catraca perde o acesso no
 * intervalo entre uma coisa e outra. Recepção com fila na porta não tem esse
 * intervalo. Digitou 145 no lugar de 120 — corrige e pronto.
 *
 * A correção NÃO é silenciosa. O valor anterior e o motivo vão para a
 * observação: um lançamento que muda de valor sem deixar rastro é exatamente o
 * que ninguém consegue explicar no fechamento do mês.
 */
export const corrigirMensalidadeAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; mensalidadeId: string;
    valor: number; formaPagamento: string; validoAte: string; motivo: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin, profileId } = await autorizar(context.userId, data.partnerId);

    const motivo = (data.motivo || "").trim();
    if (motivo.length < 3) throw new Error("Descreva o que está sendo corrigido.");

    const valor = Number(data.valor);
    if (!Number.isFinite(valor) || valor < 0) throw new Error("Valor inválido.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.validoAte || "")) {
      throw new Error("Data de validade inválida.");
    }

    // O partner_id no filtro impede corrigir lançamento de outra academia mesmo
    // com um id válido em mãos.
    const { data: alvo, error: erroBusca } = await admin
      .from("academia_mensalidades")
      .select("id, status, valor, valido_ate, forma_pagamento, taxa_percentual, observacao")
      .eq("id", data.mensalidadeId)
      .eq("partner_id", data.partnerId)
      .maybeSingle();
    if (erroBusca) throw new Error(erroBusca.message);
    if (!alvo) throw new Error("Lançamento não encontrado nesta academia.");

    const atual = alvo as {
      status: string; valor: number; valido_ate: string; forma_pagamento: string;
      taxa_percentual: number; observacao: string | null;
    };
    if (atual.status !== "ativa") {
      throw new Error("Este lançamento não está ativo. Cancelado ou estornado não se corrige — lance de novo.");
    }

    // A taxa acompanha o valor. Deixar taxa_valor e valor_liquido com o número
    // antigo faria o fluxo de caixa fechar errado sem ninguém perceber.
    const pct = Number(atual.taxa_percentual ?? 0);
    const taxaValor = Math.round(valor * (pct / 100) * 100) / 100;

    const carimbo = new Date().toLocaleDateString("pt-BR");
    const rastro = `[${carimbo}] corrigido de R$ ${Number(atual.valor).toFixed(2)} para R$ ${valor.toFixed(2)}`
      + (atual.valido_ate !== data.validoAte ? `, vencimento de ${atual.valido_ate} para ${data.validoAte}` : "")
      + `: ${motivo}`;

    const { error } = await admin
      .from("academia_mensalidades")
      .update({
        valor,
        forma_pagamento: data.formaPagamento,
        valido_ate: data.validoAte,
        taxa_valor: taxaValor,
        valor_liquido: Math.round((valor - taxaValor) * 100) / 100,
        observacao: [atual.observacao?.trim(), rastro].filter(Boolean).join("\n"),
        registrado_por: profileId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.mensalidadeId)
      .eq("partner_id", data.partnerId)
      .eq("status", "ativa");
    if (error) throw new Error(error.message);

    /*
     * As linhas de pagamento acompanham a correção.
     *
     * Sem isto, a correção mudava só a mensalidade e "Por forma de pagamento"
     * seguia somando o valor velho — foi assim que três lançamentos corrigidos
     * para R$ 0,00 deixaram R$ 0,03 fantasma no relatório, e o total do período
     * passou a discordar da soma das formas. Número que não fecha com ele mesmo
     * é pior que número ausente: a recepção para de confiar na tela inteira.
     *
     * Vira uma linha só, porque a correção só aceita uma forma. Guardar a
     * divisão antiga junto de um valor novo descreveria uma venda que não
     * existiu.
     */
    await admin
      .from("academia_mensalidade_pagamentos")
      .delete()
      .eq("mensalidade_id", data.mensalidadeId);

    if (valor > 0) {
      const { error: erroPg } = await admin
        .from("academia_mensalidade_pagamentos")
        .insert({
          mensalidade_id: data.mensalidadeId,
          forma_pagamento: data.formaPagamento,
          valor,
          taxa_percentual: pct,
          taxa_valor: taxaValor,
          valor_liquido: Math.round((valor - taxaValor) * 100) / 100,
        });
      if (erroPg) throw new Error(erroPg.message);
    }

    return { ok: true };
  });

/**
 * Até quando o aluno ficaria liberado se este lançamento fosse cancelado.
 *
 * A recepção precisa ver isso ANTES de confirmar. Cancelar sem saber onde o
 * acesso vai parar é o tipo de coisa que só aparece dois dias depois, quando a
 * pessoa é barrada na porta e ninguém liga uma coisa à outra.
 *
 * Devolve nulo quando não sobra nenhuma mensalidade ativa — ou seja, o aluno
 * fica sem acesso nenhum.
 */
export const preverCancelamentoAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; mensalidadeId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const { data: alvo } = await admin
      .from("academia_mensalidades")
      .select("id, credencial_id, student_id, valido_ate")
      .eq("id", data.mensalidadeId)
      .eq("partner_id", data.partnerId)
      .maybeSingle();
    const m = alvo as {
      id: string; credencial_id: string | null; student_id: string | null; valido_ate: string;
    } | null;
    if (!m) throw new Error("Lançamento não encontrado nesta academia.");

    // As duas pontas, como no resto do projeto: a mensalidade pode estar presa
    // à credencial da catraca ou ao aluno da plataforma.
    let q = admin
      .from("academia_mensalidades")
      .select("id, valido_ate")
      .eq("partner_id", data.partnerId)
      .eq("status", "ativa")
      .neq("id", data.mensalidadeId)
      .order("valido_ate", { ascending: false })
      .limit(1);
    q = m.credencial_id
      ? q.eq("credencial_id", m.credencial_id)
      : q.eq("student_id", m.student_id as string);

    const { data: resto, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);

    const sobra = resto as { id: string; valido_ate: string } | null;
    return {
      valeAte: m.valido_ate,
      valeAteDepois: sobra?.valido_ate ?? null,
      mensalidadeQueSobra: sobra?.id ?? null,
    };
  });

export const cancelarMensalidadeAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; mensalidadeId: string;
    status: "cancelada" | "estornada"; motivo: string;
    /**
     * Nova data de acesso depois do cancelamento.
     *
     * Cancelar sozinho já devolve a pessoa ao vencimento anterior — a régua usa
     * a mensalidade ativa de vencimento mais longe. Isto existe para o caso em
     * que a recepção quer OUTRA data: cobrou dez dias a mais, corrige para o
     * dia certo em vez de voltar ao que era.
     */
    ajustarValidoAte?: string | null;
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

    // Ajusta o que SOBROU, se pediram uma data diferente. Sem isto a única
    // saída seria cancelar tudo e lançar de novo — e o aluno ficaria sem acesso
    // no meio do caminho.
    const novaData = (data.ajustarValidoAte || "").trim();
    if (novaData) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) throw new Error("Data de acesso inválida.");

      const { data: dono } = await admin
        .from("academia_mensalidades")
        .select("credencial_id, student_id")
        .eq("id", data.mensalidadeId).maybeSingle();
      const quem = dono as { credencial_id: string | null; student_id: string | null } | null;

      let q = admin
        .from("academia_mensalidades")
        .select("id")
        .eq("partner_id", data.partnerId).eq("status", "ativa")
        .neq("id", data.mensalidadeId)
        .order("valido_ate", { ascending: false }).limit(1);
      q = quem?.credencial_id
        ? q.eq("credencial_id", quem.credencial_id)
        : q.eq("student_id", quem?.student_id as string);

      const { data: sobra } = await q.maybeSingle();
      const alvoAjuste = (sobra as { id: string } | null)?.id;
      if (alvoAjuste) {
        const { error: e3 } = await admin
          .from("academia_mensalidades")
          .update({ valido_ate: novaData, updated_at: new Date().toISOString() })
          .eq("id", alvoAjuste).eq("partner_id", data.partnerId);
        if (e3) throw new Error(e3.message);
      }
    }

    return { ok: true };
  });

/**
 * Nome dos oito marcos de fábrica.
 *
 * Só serve de rede para o histórico: `academia_avisos` guarda o marco que gerou
 * cada aviso, e um registro antigo pode apontar para um marco que a academia já
 * apagou ou renomeou. O nome de verdade vem do banco.
 */
export const ROTULO_MARCO: Record<string, string> = {
  d3: "Faltam 3 dias",
  d2: "Faltam 2 dias",
  d1: "Vence amanhã",
  d0: "Vence hoje",
  ultimo_dia: "Último dia de acesso",
  retorno_7: "Sumiu há 1 semana",
  retorno_30: "Sumiu há 1 mês",
  retorno_90: "Sumiu há 3 meses",
};

/**
 * De onde os dias do aviso são contados.
 *
 * `bloqueio` é o último dia em que a pessoa ainda entra — vencimento mais a
 * carência da academia. Contar reativação a partir daí, e não do vencimento,
 * é o que faz "faz uma semana que você não entra" ser verdade.
 */
export type ReferenciaAviso = "vencimento" | "bloqueio";

export type ModeloAviso = {
  marco: string;
  nome: string;
  texto: string;
  ativo: boolean;
  referencia: ReferenciaAviso;
  quando: number;
  posicao: number;
};

/** Distância máxima aceita, para os dois lados. */
export const LIMITE_DIAS_AVISO = 365;

/** "3 dias antes de vencer", "7 dias depois do bloqueio". */
export function descreverMomento(referencia: ReferenciaAviso, quando: number): string {
  if (quando === 0) {
    return referencia === "vencimento" ? "No dia do vencimento" : "No último dia de entrada";
  }
  const n = Math.abs(quando);
  const dias = n === 1 ? "1 dia" : `${n} dias`;
  const ponto = referencia === "vencimento" ? "de vencer" : "do bloqueio";
  return quando > 0 ? `${dias} antes ${ponto}` : `${dias} depois ${ponto}`;
}

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

    // O nome do marco vem do banco: os personalizados nao existem em
    // ROTULO_MARCO, e um marco renomeado tem que aparecer renomeado aqui.
    const { data: nomes } = await admin.from("academia_avisos_modelos")
      .select("marco, nome").eq("partner_id", data.partnerId);
    const rotulos: Record<string, string> = {};
    for (const m of (nomes ?? []) as Array<{ marco: string; nome: string | null }>) {
      rotulos[m.marco] = m.nome || ROTULO_MARCO[m.marco] || m.marco;
    }

    const lista = (pendentes ?? []) as AvisoPendente[];
    return {
      rotulos,
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

/**
 * Uma chave estável para o aviso.
 *
 * Sai do momento por legibilidade, mas NÃO é o momento: uma vez criada, a chave
 * não muda mais, nem quando a academia move o aviso de dia. É ela que liga o
 * histórico em `academia_avisos` ao modelo, e reescrever isso apagaria a
 * memória de quem já foi avisado.
 */
async function chaveLivreDeAviso(
  admin: Admin,
  partnerId: string,
  referencia: ReferenciaAviso,
  quando: number,
): Promise<string> {
  const base = `m_${referencia}_${quando}`;
  const { data } = await admin.from("academia_avisos_modelos")
    .select("marco").eq("partner_id", partnerId).like("marco", `${base}%`);

  const usadas = new Set(((data ?? []) as Array<{ marco: string }>).map((m) => m.marco));
  if (!usadas.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!usadas.has(`${base}_${i}`)) return `${base}_${i}`;
  throw new Error("Avisos demais nesse mesmo dia.");
}

/** Valida nome, texto e distância. Devolve já aparado. */
function conferirAviso(d: { nome: string; texto: string; referencia: string; quando: number }) {
  const nome = (d.nome || "").trim();
  const texto = (d.texto || "").trim();
  if (!nome) throw new Error("Dê um nome ao aviso.");
  if (!texto) throw new Error(`Escreva o texto de "${nome}".`);
  if (d.referencia !== "vencimento" && d.referencia !== "bloqueio") {
    throw new Error("Escolha se a contagem é a partir do vencimento ou do bloqueio.");
  }
  const quando = Math.trunc(Number(d.quando));
  if (!Number.isFinite(quando) || Math.abs(quando) > LIMITE_DIAS_AVISO) {
    throw new Error(`Use no máximo ${LIMITE_DIAS_AVISO} dias de distância.`);
  }
  return { nome, texto, referencia: d.referencia as ReferenciaAviso, quando };
}

/** Os avisos desta academia, na ordem em que ela mandou. */
export const obterModelosAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    // Academia nova nasce com os oito prontos. A semeadura mora no banco, junto
    // dos textos padrão — uma segunda cópia deles aqui sairia de sincronia.
    const { error: eSemear } = await admin.rpc("academia_avisos_semear", {
      p_partner_id: data.partnerId,
    });
    if (eSemear) throw new Error(eSemear.message);

    const [modelosRes, cfgRes] = await Promise.all([
      admin.from("academia_avisos_modelos")
        .select("marco, nome, texto, ativo, referencia, quando, posicao")
        .eq("partner_id", data.partnerId)
        .order("posicao"),
      admin.from("partner_acesso_config")
        .select("avisos_automaticos, dias_carencia")
        .eq("partner_id", data.partnerId).maybeSingle(),
    ]);
    if (modelosRes.error) throw new Error(modelosRes.error.message);

    const cfg = cfgRes.data as { avisos_automaticos?: boolean; dias_carencia?: number } | null;
    return {
      automatico: Boolean(cfg?.avisos_automaticos),
      // A tela explica "último dia de entrada" em dias reais, e isso depende da
      // carência desta academia.
      carencia: Number(cfg?.dias_carencia ?? 3),
      modelos: (modelosRes.data ?? []).map((m): ModeloAviso => ({
        marco: m.marco,
        nome: m.nome || ROTULO_MARCO[m.marco] || m.marco,
        texto: m.texto,
        ativo: m.ativo,
        referencia: m.referencia === "bloqueio" ? "bloqueio" : "vencimento",
        quando: m.quando,
        posicao: m.posicao,
      })),
    };
  });

/** Salva nome, texto e liga/desliga. O dia do disparo é mexido por moverMarcoAviso. */
export const salvarModelosAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; automatico: boolean;
    modelos: Array<{ marco: string; nome: string; texto: string; ativo: boolean }>;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    for (const m of data.modelos) {
      const nome = (m.nome || "").trim();
      const texto = (m.texto || "").trim();
      if (!nome) throw new Error("Todo aviso precisa de um nome.");
      if (!texto) throw new Error(`O texto de "${nome}" não pode ficar vazio.`);

      const { error } = await admin.from("academia_avisos_modelos")
        .update({ nome, texto, ativo: m.ativo, updated_at: new Date().toISOString() })
        .eq("partner_id", data.partnerId).eq("marco", m.marco);
      if (error) throw new Error(error.message);
    }

    const { error: e2 } = await admin.from("partner_acesso_config").upsert(
      { partner_id: data.partnerId, avisos_automaticos: data.automatico },
      { onConflict: "partner_id" },
    );
    if (e2) throw new Error(e2.message);

    return { ok: true };
  });

/** Um aviso novo, no dia que a academia escolher. */
export const criarMarcoAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; nome: string; texto: string;
    referencia: string; quando: number;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { nome, texto, referencia, quando } = conferirAviso(data);

    // O índice único do banco já barra a colisão, mas o erro dele é ilegível
    // para quem está na recepção. Checar antes deixa a mensagem em português.
    const { data: ocupado } = await admin.from("academia_avisos_modelos")
      .select("nome").eq("partner_id", data.partnerId)
      .eq("referencia", referencia).eq("quando", quando).maybeSingle();
    if (ocupado) {
      const dono = (ocupado as { nome: string | null }).nome ?? "outro aviso";
      throw new Error(`Já existe um aviso nesse dia: "${dono}".`);
    }

    const { data: ultimo } = await admin.from("academia_avisos_modelos")
      .select("posicao").eq("partner_id", data.partnerId)
      .order("posicao", { ascending: false }).limit(1).maybeSingle();

    const marco = await chaveLivreDeAviso(admin, data.partnerId, referencia, quando);
    const { error } = await admin.from("academia_avisos_modelos").insert({
      partner_id: data.partnerId, marco, nome, texto, ativo: true,
      referencia, quando,
      posicao: Number((ultimo as { posicao?: number } | null)?.posicao ?? 0) + 1,
    });
    if (error) throw new Error(error.message);

    return { ok: true, marco };
  });

/** Muda o dia de um aviso que já existe, sem perder o texto nem o histórico. */
export const moverMarcoAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; marco: string; referencia: string; quando: number;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    // Nome e texto não vêm nesta rota; o conferirAviso só valida o momento.
    const { referencia, quando } = conferirAviso({ ...data, nome: "x", texto: "x" });

    const { data: ocupado } = await admin.from("academia_avisos_modelos")
      .select("marco, nome").eq("partner_id", data.partnerId)
      .eq("referencia", referencia).eq("quando", quando).maybeSingle();
    if (ocupado && (ocupado as { marco: string }).marco !== data.marco) {
      const dono = (ocupado as { nome: string | null }).nome ?? "outro aviso";
      throw new Error(`Já existe um aviso nesse dia: "${dono}".`);
    }

    // A chave NÃO muda junto. Ela é o que liga o histórico ao modelo.
    const { error } = await admin.from("academia_avisos_modelos")
      .update({ referencia, quando, updated_at: new Date().toISOString() })
      .eq("partner_id", data.partnerId).eq("marco", data.marco);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const excluirMarcoAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; marco: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    // O histórico em `academia_avisos` fica onde está. Ele registra o que foi
    // gerado, e apagar o modelo não pode reescrever o passado.
    const { error } = await admin.from("academia_avisos_modelos").delete()
      .eq("partner_id", data.partnerId).eq("marco", data.marco);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/**
 * A ordem da lista.
 *
 * Não é enfeite: é o desempate quando dois avisos caem no mesmo dia — e eles
 * caem, porque mudar a carência move todos os marcos de bloqueio de uma vez.
 * Ganha o de cima.
 */
export const reordenarMarcosAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; marcos: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    for (let i = 0; i < data.marcos.length; i++) {
      const { error } = await admin.from("academia_avisos_modelos")
        .update({ posicao: i + 1 })
        .eq("partner_id", data.partnerId).eq("marco", data.marcos[i]);
      if (error) throw new Error(error.message);
    }
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

/**
 * Funil e campanha na mesma leitura.
 *
 * Responde, sem trocar de aba, o que hoje exige abrir CRM e Robô lado a lado:
 * quantos estão em cada etapa, quantos desses já receberam alguma mensagem, e
 * quantos nunca receberam nada. O cruzamento mora em `academia_funil_campanhas`
 * — no banco, porque é lá que estão as duas pontas.
 */
export type RecorteFunil = "todos" | "alcancados" | "so_automatico" | "nunca" | "sem_telefone";

export type ColunaComCampanhas = {
  coluna_id: string;
  coluna: string;
  posicao: number;
  tipo: string;
  pessoas: number;
  sem_telefone: number;
  alcancados: number;
  /** Recebeu, mas só o que a máquina montou: ninguém escreveu para essa pessoa. */
  so_automatico: number;
  nunca: number;
  ultima_campanha: string | null;
  ultima_campanha_em: string | null;
  ultima_automatica: boolean | null;
};

export type PessoaDoFunil = {
  cartao_id: string;
  nome: string;
  telefone: string | null;
  campanhas: number;
  ultima_campanha: string | null;
  ultima_campanha_em: string | null;
  ultima_automatica: boolean | null;
};

export const obterFunilComCampanhas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; quadroId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    // Só quadro do tipo 'funil': é o mesmo filtro da lista de origens da aba
    // Robô. Oferecer aqui um quadro que lá não aparece como fonte prometeria um
    // caminho que a campanha não tem.
    const { data: quadros } = await admin
      .from("crm_quadros")
      .select("id, nome")
      .eq("escopo", "parceiro")
      .eq("owner_id", data.partnerId)
      .eq("tipo", "funil")
      .is("arquivado_em", null)
      .order("created_at");

    const lista = (quadros ?? []) as Array<{ id: string; nome: string }>;
    const escolhido = lista.some((q) => q.id === data.quadroId)
      ? (data.quadroId as string)
      : lista[0]?.id ?? null;
    if (!escolhido) return { quadros: lista, quadroId: null, colunas: [] as ColunaComCampanhas[] };

    // `as never` porque os tipos gerados do Supabase ainda não conhecem esta
    // função — ela nasceu na migration de hoje.
    const { data: colunas, error } = await admin.rpc("academia_funil_campanhas" as never, {
      p_partner_id: data.partnerId,
      p_quadro_id: escolhido,
    } as never);
    if (error) throw new Error(error.message);

    return {
      quadros: lista,
      quadroId: escolhido,
      colunas: (colunas ?? []) as ColunaComCampanhas[],
    };
  });

/** Quem está por trás de um número da tela. */
export const pessoasDoFunil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; colunaId: string; recorte: RecorteFunil }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: pessoas, error } = await admin.rpc("academia_funil_campanhas_pessoas" as never, {
      p_partner_id: data.partnerId,
      p_coluna_id: data.colunaId,
      p_recorte: data.recorte,
    } as never);
    if (error) throw new Error(error.message);
    return { pessoas: (pessoas ?? []) as PessoaDoFunil[] };
  });

/**
 * Abre uma campanha em rascunho para uma coluna do funil.
 *
 * Só isso. Quem monta a lista de contatos é `alvosDoFunil`, que a tela chama em
 * seguida com a mesma coluna, e quem envia é `dispararCampanha`, na aba Robô —
 * é lá que moram o limite diário do chip, o espaçamento entre mensagens e a
 * deduplicação de conversa. Uma cópia de qualquer um dos dois aqui viraria uma
 * segunda versão da regra que protege o número da academia.
 */
export const criarCampanhaDaColuna = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; nome: string; mensagem: string; intervaloSegundos?: number;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin, profileId } = await autorizar(context.userId, data.partnerId);

    const nome = (data.nome ?? "").trim();
    const mensagem = (data.mensagem ?? "").trim();
    if (!nome) throw new Error("Dê um nome à campanha.");
    if (!mensagem) throw new Error("Escreva a mensagem.");

    const { data: criada, error } = await admin
      .from("bot_disparos")
      .insert({
        escopo: "parceiro",
        owner_id: data.partnerId,
        nome,
        mensagem,
        status: "rascunho",
        intervalo_segundos: Math.min(600, Math.max(5, Math.round(data.intervaloSegundos ?? 20))),
        criado_por: profileId,
        // Explícito porque o gancho horário dispara sozinho o que estiver
        // marcado como automático. Esta foi escrita por gente e só sai quando
        // alguém apertar o botão.
        automatico: false,
        // `as never`: os tipos gerados ainda não têm `automatico`, que entrou
        // em bot_disparos na migration de 27/08.
      } as never)
      .select("id, nome")
      .single();
    if (error) throw new Error(error.message);

    return criada as { id: string; nome: string };
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
        .select("id, nome, modalidade, dias_semana, hora_inicio, hora_fim" as never)
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
      // Dia e janela vão junto: com a grade cadastrada como "05:00", "06:00"…
      // o nome sozinho não deixa ninguém conferir se está certo.
      turmas: (turmas ?? []) as unknown as Array<{
        id: string; nome: string; modalidade: string | null;
        dias_semana: number[] | null; hora_inicio: string | null; hora_fim: string | null;
      }>,
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
    diasSemana?: number[]; horaInicio?: string | null; horaFim?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const nome = (data.nome || "").trim();
    if (nome.length < 2) throw new Error("Informe o nome da turma.");

    // Uma aula de segunda a sexta é UMA aula. O modelo antigo guardava um dia
    // só, o que transformaria a grade da academia em 30 turmas — e a tabela do
    // relatório em algo que ninguém lê.
    const dias = Array.from(
      new Set((data.diasSemana ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)),
    ).sort((a, b) => a - b);

    // Janela pela metade não classifica passagem nenhuma: a consulta exige as
    // duas pontas. Barrar aqui evita criar uma turma que some do relatório.
    const ini = data.horaInicio || null;
    const fim = data.horaFim || null;
    if ((ini && !fim) || (!ini && fim)) throw new Error("Informe o horário de início e o de fim.");
    if (ini && fim && fim <= ini) throw new Error("O fim precisa ser depois do início.");

    // `as never` porque os tipos gerados do Supabase ainda não conhecem
    // `dias_semana` — a coluna nasceu na migration de hoje.
    const { error } = await admin.from("academia_turmas").insert({
      partner_id: data.partnerId,
      nome,
      modalidade: data.modalidade?.trim() || null,
      dias_semana: dias,
      hora_inicio: ini,
      hora_fim: fim,
    } as never);
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

    // Evento vai no mesmo botão. Para quem está na recepção existe uma coisa
    // só — "alguma compra ficou sem liberar?" — e ela não deveria precisar
    // saber que por dentro são dois caminhos diferentes.
    const { data: nEvento } = await admin.rpc(
      "academia_evento_inscricoes_pendentes_reprocessar" as never,
      { p_partner_id: data.partnerId } as never,
    );
    return { geradas: Number(n ?? 0), inscricoes: Number(nEvento ?? 0) };
  });

/** Produtos da loja que geram inscrição em evento nesta academia. */
export const obterProdutosEvento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const [{ data: vinculos }, { data: eventos }] = await Promise.all([
      admin
        .from("academia_produtos_evento" as never)
        .select("id, product_id, evento_id, ativo" as never)
        .eq("partner_id", data.partnerId),
      admin
        .from("academia_eventos")
        .select("id, nome, data_evento")
        .eq("partner_id", data.partnerId)
        .eq("ativo", true)
        .order("data_evento", { ascending: false })
        .limit(30),
    ]);

    const linhas = (vinculos ?? []) as unknown as Array<{
      id: string; product_id: string; evento_id: string; ativo: boolean;
    }>;
    const ids = linhas.map((v) => v.product_id);
    const { data: nomes } = ids.length
      ? await admin.from("products").select("id, name").in("id", ids)
      : { data: [] };

    return {
      vinculos: linhas,
      eventos: (eventos ?? []) as Array<{ id: string; nome: string; data_evento: string }>,
      nomes: Object.fromEntries(
        ((nomes ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]),
      ),
    };
  });

export const salvarProdutoEvento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; productId: string; eventoId: string; ativo: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    // O cliente `admin` é service_role e ignora RLS: sem esta conferência dava
    // para apontar um produto para o evento de outra academia.
    const { data: evento } = await admin
      .from("academia_eventos")
      .select("id")
      .eq("id", data.eventoId)
      .eq("partner_id", data.partnerId)
      .maybeSingle();
    if (!evento) throw new Error("Evento não encontrado nesta academia.");

    const { error } = await admin.from("academia_produtos_evento" as never).upsert(
      {
        partner_id: data.partnerId,
        product_id: data.productId,
        evento_id: data.eventoId,
        ativo: data.ativo,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "product_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerProdutoEvento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; id: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { error } = await admin
      .from("academia_produtos_evento" as never)
      .delete()
      .eq("id", data.id)
      .eq("partner_id", data.partnerId);
    if (error) throw new Error(error.message);
    return { ok: true };
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

/**
 * Corta o acesso de um computador pareado.
 *
 * Reinstalar o agente cria pareamento novo e o antigo **continua valendo**: as
 * onze funções que o programa chama exigem `ativo AND segredo_hash = ...`, então
 * o segredo de uma máquina aposentada abre catraca até alguém desligar a linha.
 * Já houve três "PC da recepcao" vivos ao mesmo tempo, desligados direto no
 * banco — caminho que o dono da academia não tem.
 *
 * Não apaga a linha. O histórico é o que responde "desde quando aquele
 * computador tinha acesso", e apagar destrói a resposta.
 */
export const desativarAgente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; agenteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { error } = await admin
      .from("academia_agentes")
      .update({ ativo: false })
      // O partner_id no filtro não é redundante com o autorizar: ele impede que
      // um id de agente de OUTRA academia seja desativado por quem só tem acesso
      // a esta.
      .eq("id", data.agenteId)
      .eq("partner_id", data.partnerId);
    if (error) throw new Error(error.message);
  });

/**
 * O que existe publicado hoje dos dois programas do PC da academia.
 *
 * Devolve só nome de arquivo e versão — nunca o conteúdo. O conteúdo sai um
 * arquivo por vez em /api/instalacao/arquivo, senão a tela carregaria dezenas
 * de KB de código a cada abertura para exibir uma lista.
 */
export const obterPacotesInstalacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    await autorizar(context.userId, data.partnerId);
    const { obterUltimaVersao, estadoDoPacoteBase } = await import("./instalacao.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [agente, conector, baseAgente, baseConector, perfil] = await Promise.all([
      obterUltimaVersao("agente"),
      obterUltimaVersao("conector"),
      estadoDoPacoteBase("agente"),
      estadoDoPacoteBase("conector"),
      supabaseAdmin.from("profiles").select("is_master_admin").eq("user_id", context.userId).maybeSingle(),
    ]);

    const resumir = (v: Awaited<ReturnType<typeof obterUltimaVersao>>) =>
      v ? { versao: v.versao, notas: v.notas, arquivos: Object.keys(v.arquivos).sort() } : null;

    return {
      agente: resumir(agente),
      conector: resumir(conector),
      base: { agente: baseAgente, conector: baseConector },
      // Quem envia o pacote base é o suporte, não a academia: são os binários
      // que ficam fora da auto-atualização de propósito.
      souSuporte: Boolean((perfil.data as { is_master_admin?: boolean } | null)?.is_master_admin),
    };
  });

/**
 * Prepara o envio do pacote base, que só o suporte da FitMind faz.
 *
 * O arquivo sobe direto do navegador para o storage por URL assinada — ele tem
 * dezenas de MB e não tem por que atravessar o servidor da aplicação. `upsert`
 * ligado porque publicar de novo é substituir: só existe um base por programa,
 * e é o ponto de partida, não uma versão histórica.
 */
export const gerarEnvioDoPacoteBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { programa: "agente" | "conector" }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: perfil } = await supabaseAdmin
      .from("profiles").select("is_master_admin").eq("user_id", context.userId).maybeSingle();

    if (!(perfil as { is_master_admin?: boolean } | null)?.is_master_admin) {
      throw new Error("Só o suporte da FitMind envia o pacote base.");
    }

    const { caminhoDoPacoteBase } = await import("./instalacao.server");
    const caminho = caminhoDoPacoteBase(data.programa);
    const { data: envio, error } = await supabaseAdmin.storage
      .from("instalacao")
      .createSignedUploadUrl(caminho, { upsert: true });

    if (error || !envio) throw new Error(error?.message ?? "Não deu para preparar o envio.");
    // O caminho volta daqui para o navegador não ter uma segunda cópia da regra
    // de onde o pacote base mora.
    return { url: envio.signedUrl, token: envio.token, caminho };
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

/** Enfileira a face de uma pessoa cadastrada somente na academia. */
export const enviarFotoCredencial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; credencialId: string; fotoBase64: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const b64 = String(data.fotoBase64 || "").replace(/^data:[^;]+;base64,/, "");
    if (b64.length < 1000) throw new Error("Foto ausente ou pequena demais.");
    if (b64.length > 2_000_000) throw new Error("Foto muito grande. Use uma imagem menor.");

    const { data: resultado, error } = await admin.rpc("academia_face_enfileirar_credencial", {
      p_partner_id: data.partnerId,
      p_credencial_id: data.credencialId,
      p_foto_base64: b64,
    } as never);
    if (error) throw new Error(error.message);

    const linha = ((resultado ?? []) as Array<{ envio_id: string; referencia: string }>)[0];
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

/**
 * O envio automático dos avisos: se pode, a que horas e em que dias.
 *
 * Fica separado da configuração geral de propósito. Isto não é um ajuste: é a
 * academia autorizando o sistema a falar com os clientes dela sem ninguém ler
 * antes. Nasce DESLIGADO e a tela mostra o que vai sair antes de ligar.
 */
export const obterAutomacaoAvisos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: cfg } = await admin
      .from("partner_acesso_config")
      .select("avisos_envio_automatico, avisos_hora, avisos_dias, timezone" as never)
      .eq("partner_id", data.partnerId)
      .maybeSingle();
    const c = cfg as null | {
      avisos_envio_automatico: boolean; avisos_hora: number;
      avisos_dias: number[] | null; timezone: string | null;
    };
    return {
      automatico: c?.avisos_envio_automatico ?? false,
      hora: c?.avisos_hora ?? 9,
      dias: c?.avisos_dias ?? [1, 2, 3, 4, 5],
      timezone: c?.timezone ?? "America/Sao_Paulo",
    };
  });

export const salvarAutomacaoAvisos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; automatico: boolean; hora: number; dias: number[] }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const hora = Math.min(23, Math.max(0, Math.trunc(Number(data.hora) || 0)));
    const dias = Array.from(
      new Set((data.dias ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)),
    ).sort((a, b) => a - b);

    // Ligar sem escolher nenhum dia seria ligar e não enviar nunca — sem erro,
    // sem aviso, e a academia achando que está avisando os clientes.
    if (data.automatico && !dias.length) {
      throw new Error("Escolha ao menos um dia da semana para o envio automático.");
    }

    const { error } = await admin.from("partner_acesso_config").upsert(
      {
        partner_id: data.partnerId,
        avisos_envio_automatico: !!data.automatico,
        avisos_hora: hora,
        avisos_dias: dias,
      } as never,
      { onConflict: "partner_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, automatico: !!data.automatico, hora, dias };
  });

/**
 * Os dias em que a academia não abre.
 *
 * A lista é da academia, não do Brasil: feriado nacional não fecha toda
 * academia, e o que fecha de verdade costuma ser local ou particular
 * (dedetização, reforma, férias coletiva). Quem sabe é a recepção.
 */
export const listarFeriados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: linhas } = await admin
      .from("partner_feriados" as never)
      .select("id, data, nome, fechado" as never)
      .eq("partner_id", data.partnerId)
      .gte("data", new Date().toISOString().slice(0, 10))
      .order("data");
    return {
      feriados: (linhas ?? []) as unknown as Array<{
        id: string; data: string; nome: string; fechado: boolean;
      }>,
    };
  });

export const salvarFeriado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; data: string; nome: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const nome = (data.nome || "").trim();
    if (nome.length < 2) throw new Error("Dê um nome ao feriado.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.data)) throw new Error("Data inválida.");

    const { error } = await admin.from("partner_feriados" as never).upsert(
      { partner_id: data.partnerId, data: data.data, nome, fechado: true } as never,
      { onConflict: "partner_id,data" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirFeriado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; id: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { error } = await admin
      .from("partner_feriados" as never)
      .delete()
      .eq("id", data.id)
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
      .select("dias_carencia, exige_senha_liberacao, regra_dayuse, timezone, modelo_catraca, regime_turma")
      .eq("partner_id", data.partnerId)
      .maybeSingle();
    const { data: taxas } = await admin
      .from("partner_taxas_externas")
      .select("forma_pagamento, taxa_percentual, taxa_fixa")
      .eq("partner_id", data.partnerId);
    return {
      config: (cfg as null | {
        dias_carencia: number; exige_senha_liberacao: boolean; regra_dayuse: string;
        timezone: string; modelo_catraca: string | null; regime_turma: string;
      }) ?? {
        dias_carencia: 3,
        exige_senha_liberacao: false,
        regra_dayuse: "uma_vez_na_vida",
        timezone: "America/Sao_Paulo",
        modelo_catraca: null,
        regime_turma: "livre",
      },
      taxas: (taxas ?? []) as Array<{ forma_pagamento: FormaPagamento; taxa_percentual: number; taxa_fixa: number }>,
    };
  });

export const salvarConfigAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; diasCarencia: number; exigeSenha: boolean;
    regraDayuse: string; timezone: string; modeloCatraca: string | null;
    regimeTurma: string;
    taxas: Array<{ forma_pagamento: FormaPagamento; taxa_percentual: number; taxa_fixa: number }>;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    // O regime decide se o aluno vê o botão de reservar, e se falta é aula
    // perdida ou semana abaixo da meta. Valor fora da lista quebraria as duas
    // pontas em silêncio, então a barreira é aqui e não só no CHECK do banco.
    if (!["livre", "marcado", "reserva"].includes(data.regimeTurma)) {
      throw new Error("Regime de turma inválido.");
    }

    const { error } = await admin.from("partner_acesso_config").upsert(
      {
        partner_id: data.partnerId,
        dias_carencia: data.diasCarencia,
        exige_senha_liberacao: data.exigeSenha,
        regra_dayuse: data.regraDayuse,
        timezone: data.timezone,
        modelo_catraca: data.modeloCatraca,
        regime_turma: data.regimeTurma,
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
/** Quantos dias por semana o plano libera. Nulo = ilimitado. */
export const LIMITES_SEMANA = [
  { value: 0, label: "Ilimitado (todo dia)" },
  { value: 1, label: "1x por semana" },
  { value: 2, label: "2x por semana" },
  { value: 3, label: "3x por semana" },
  { value: 4, label: "4x por semana" },
  { value: 5, label: "5x por semana" },
  { value: 6, label: "6x por semana" },
] as const;

/** Durações prontas. O campo aceita qualquer número — isto é só atalho. */
export const DURACOES = [30, 60, 90, 180, 365] as const;

/** Todos os planos da academia, inclusive os desligados. */
export const listarPlanosParaGerir = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: linhas, error } = await admin
      .from("academia_planos" as never)
      .select("id, nome, valor_padrao, dias, limite_dias_semana, ativo, posicao" as never)
      .eq("partner_id" as never, data.partnerId)
      .order("posicao" as never, { ascending: true });
    if (error) throw new Error(error.message);
    return {
      planos: (linhas ?? []) as unknown as Array<{
        id: string; nome: string; valor_padrao: number; dias: number;
        limite_dias_semana: number | null; ativo: boolean; posicao: number;
      }>,
    };
  });

/**
 * Cria ou edita um plano da academia.
 *
 * Os quatro planos que existiam nasceram de uma migration — não havia jeito de
 * criar o quinto pela tela. Uma academia que lança promoção, aula avulsa ou
 * cortesia precisava de código para isso, e é o tipo de coisa que ela faz numa
 * terça à tarde.
 *
 * Valor ZERO é legítimo e tem nome: cortesia. Não é erro de digitação, e por
 * isso não bloqueia nada — o lançamento entra com R$ 0,00 e o acesso vale igual.
 */
export const salvarPlanoAcademia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; id?: string | null; nome: string;
    valorPadrao: number; dias: number;
    limiteDiasSemana: number | null; ativo: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);

    const nome = (data.nome || "").trim();
    if (nome.length < 2) throw new Error("Dê um nome ao plano.");

    const dias = Math.trunc(Number(data.dias));
    if (!Number.isFinite(dias) || dias < 1 || dias > 3650) {
      throw new Error("Quantos dias o plano libera? Use um número entre 1 e 3650.");
    }

    const valor = Number(data.valorPadrao);
    if (!Number.isFinite(valor) || valor < 0) throw new Error("Valor inválido.");

    // 0 na tela quer dizer "sem limite". No banco isso é NULL, porque a régua
    // de acesso testa `limite IS NOT NULL` para saber se precisa contar dias.
    const limite = data.limiteDiasSemana && data.limiteDiasSemana > 0
      ? Math.trunc(data.limiteDiasSemana)
      : null;
    if (limite !== null && (limite < 1 || limite > 7)) {
      throw new Error("O limite semanal vai de 1 a 7 dias.");
    }

    const campos = {
      partner_id: data.partnerId,
      nome,
      valor_padrao: valor,
      dias,
      limite_dias_semana: limite,
      ativo: data.ativo,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await admin
        .from("academia_planos" as never)
        .update(campos as never)
        .eq("id" as never, data.id)
        .eq("partner_id" as never, data.partnerId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }

    // Entra no fim da lista. A ordem é só de exibição na hora de vender.
    const { data: ultimo } = await admin
      .from("academia_planos" as never)
      .select("posicao" as never)
      .eq("partner_id" as never, data.partnerId)
      .order("posicao" as never, { ascending: false })
      .limit(1).maybeSingle();

    const { data: novo, error } = await admin
      .from("academia_planos" as never)
      .insert({
        ...campos,
        posicao: Number((ultimo as { posicao?: number } | null)?.posicao ?? 0) + 1,
      } as never)
      .select("id" as never).single();
    if (error) throw new Error(error.message);

    return { ok: true, id: (novo as unknown as { id: string }).id };
  });

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
    /**
     * Lançamento sem cobrança, de propósito.
     *
     * Precisa ser dito em voz alta. A trava de "informe o valor" existe para
     * pegar quem esqueceu de digitar — sem ela, um lançamento de R$ 0,00 por
     * engano vira receita perdida que ninguém reconcilia no fim do mês. Com a
     * bandeira, zero deixa de ser acidente e passa a ser decisão.
     */
    cortesia?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin, profileId } = await autorizar(context.userId, data.partnerId);

    const pagamentos = (data.pagamentos ?? [])
      .map((p) => ({ forma: p.forma, valor: Math.round((Number(p.valor) || 0) * 100) / 100 }))
      .filter((p) => p.valor > 0);
    if (pagamentos.length === 0 && !data.cortesia) {
      throw new Error("Informe ao menos uma forma de pagamento com valor — ou marque como cortesia.");
    }
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
      situacao: { liberados: number; em_carencia: number; a_vencer: number; bloqueados: number; bloqueados_antigos: number; total_com_mensalidade: number };
      sem_mensalidade: number;
      vencem_em_7: number;
      frequencia: { entradas: number; pessoas: number; manuais: number };
      negados: number;
    };
  });

/**
 * O que o relatório de caixa não responde: quanto vem, quem renovou, quem
 * entrou e quem está pagando sem aparecer.
 *
 * Função separada de propósito. `academia_relatorio` alimenta a tela que a
 * recepção abre todo dia; se este bloco quebrar, ele quebra sozinho.
 *
 * A projeção não sai do histórico — 410 das 413 mensalidades vieram do Next Fit
 * com valor zero, e somar isso mostraria uma academia que não fatura. Ela sai
 * do preço de tabela do plano, e `projecaoSemPreco` conta quem ficou de fora
 * para o número não mentir por omissão.
 */
export const relatorioAcademiaExtra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; de?: string; ate?: string; projecaoAte?: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_relatorio_extra" as never, {
      p_partner_id: data.partnerId,
      p_de: data.de ?? null,
      p_ate: data.ate ?? null,
      p_projecao_ate: data.projecaoAte ?? null,
    } as never);
    if (error) throw new Error(error.message);

    const l = (Array.isArray(r) ? r[0] : r) as unknown as {
      projecao_valor: number; projecao_pessoas: number; projecao_sem_preco: number;
      projecao_sumidos: number;
      renovacoes_qtd: number; renovacoes_valor: number; novos_qtd: number;
      sem_frequencia_qtd: number; dayuse_qtd: number; dayuse_valor: number;
    } | null;

    return {
      projecaoValor: Number(l?.projecao_valor ?? 0),
      projecaoPessoas: Number(l?.projecao_pessoas ?? 0),
      projecaoSemPreco: Number(l?.projecao_sem_preco ?? 0),
      projecaoSumidos: Number(l?.projecao_sumidos ?? 0),
      renovacoesQtd: Number(l?.renovacoes_qtd ?? 0),
      renovacoesValor: Number(l?.renovacoes_valor ?? 0),
      novosQtd: Number(l?.novos_qtd ?? 0),
      semFrequenciaQtd: Number(l?.sem_frequencia_qtd ?? 0),
      dayuseQtd: Number(l?.dayuse_qtd ?? 0),
      dayuseValor: Number(l?.dayuse_valor ?? 0),
    };
  });

/**
 * Quantas pessoas vieram em cada aula, e como foi cada evento.
 *
 * A aula sai do relógio, não da catraca. `academia_frequencias.turma_id` existe
 * e está sempre nula: o agente não sabe qual aula está acontecendo, e ensinar
 * isso a ele significaria publicar versão nova a cada mudança de horário. A
 * passagem cai na turma cuja janela a contém — o que classifica retroativamente
 * tudo que já foi coletado e continua certo se a grade mudar.
 *
 * "Fora de aula" não é sobra: é o número que diz se a grade cadastrada descreve
 * o que realmente acontece na academia.
 */
export const relatorioTurmasEEventos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; de?: string; ate?: string }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    const args = { p_partner_id: data.partnerId, p_de: data.de ?? null, p_ate: data.ate ?? null };
    const [turmas, eventos] = await Promise.all([
      admin.rpc("academia_relatorio_turmas" as never, args as never),
      admin.rpc("academia_relatorio_eventos" as never, args as never),
    ]);
    if (turmas.error) throw new Error(turmas.error.message);
    if (eventos.error) throw new Error(eventos.error.message);
    return {
      turmas: (turmas.data ?? []) as unknown as Array<{
        turma_id: string | null; turma: string; modalidade: string | null;
        dias: string | null; janela: string; comeca: string | null;
        entradas: number; pessoas: number;
      }>,
      eventos: (eventos.data ?? []) as unknown as Array<{
        evento_id: string; nome: string; data_evento: string; hora_inicio: string | null;
        valor: number; inscritos: number; compareceram: number; bruto: number; liquido: number;
      }>,
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

    /*
     * Identificador na FAIXA RESERVADA da FitMind, nunca sorteado.
     *
     * A versão anterior sorteava um número de 6 dígitos entre 100000 e 999999 e
     * conferia se estava livre apenas entre credenciais `tipo = 'pin'` — ou
     * seja, não olhava as 408 credenciais faciais vindas do leitor. Dois
     * estragos saíam dali:
     *
     * 1. O sorteio podia cair em 900000+, que é a faixa onde o Next Fit cria os
     *    alunos dele. Duas pessoas com o mesmo id no equipamento significa uma
     *    herdando a liberação da outra — num controle de acesso, é alguém
     *    entrando no lugar de outra pessoa.
     *
     * 2. Podia colidir com uma credencial facial já existente, porque o filtro
     *    de tipo excluía justamente elas da verificação.
     *
     * A faixa 700001+ é nossa desde a migration de 18/08: 1..421 e 900000+ são
     * do sistema antigo. Aqui é max+1 dentro dela, conferindo contra TODAS as
     * credenciais da unidade.
     */
    const INICIO_FAIXA = 700001;
    const { data: usados } = await admin
      .from("academia_credenciais")
      .select("referencia")
      .eq("partner_id", data.partnerId);

    const todos = ((usados ?? []) as Array<{ referencia: string }>)
      .map((u) => Number(u.referencia))
      .filter((n) => Number.isFinite(n));
    const ocupados = new Set(todos);
    const nossos = todos.filter((n) => n >= INICIO_FAIXA);

    let candidato = nossos.length ? Math.max(...nossos) + 1 : INICIO_FAIXA;
    while (ocupados.has(candidato)) candidato += 1;
    const referencia = String(candidato);

    const { data: criada, error } = await admin
      .from("academia_credenciais")
      .insert({
        partner_id: data.partnerId,
        student_id: null,
        /*
         * 'facial', não 'pin'.
         *
         * A chave única de academia_credenciais é (partner_id, tipo,
         * referencia) — o tipo faz parte dela. Cadastrando como 'pin', a mesma
         * pessoa virava DUAS linhas assim que o agente a criasse no leitor e o
         * import a trouxesse de volta como 'facial'. Aconteceu com a credencial
         * 537364 em 25/08: duas linhas, uma com a mensalidade e outra com o
         * vínculo do equipamento.
         *
         * E 'facial' é o que ela de fato é: nesta academia a pessoa é
         * reconhecida por rosto na catraca, não por PIN digitado.
         */
        tipo: "facial",
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

export type CategoriaRelatorio =
  | "liberados" | "a_vencer" | "em_carencia" | "bloqueados" | "vencem_em_7"
  | "sem_mensalidade" | "entradas" | "manuais" | "barradas"
  // As de baixo vêm de `academia_relatorio_pessoas_extra`, não da original.
  | "projecao" | "renovacoes" | "novos" | "sem_frequencia" | "dayuse"
  // Estas tres precisam de `filtro`: qual forma, qual plano.
  | "recebido" | "forma" | "plano" | "bloqueados_antigos";

/** Quais categorias moram na função nova. */
const CATEGORIAS_EXTRA = new Set<CategoriaRelatorio>([
  "projecao", "renovacoes", "novos", "sem_frequencia", "dayuse",
  "recebido", "forma", "plano", "bloqueados_antigos",
]);

/**
 * Quem são as pessoas por trás de um número do relatório.
 *
 * "274 bloqueados" não dá para trabalhar: a recepção precisa da lista para
 * ligar, cobrar ou renovar. Sai da mesma régua que produziu o número, então os
 * dois nunca discordam.
 */
export const pessoasDoRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    partnerId: string; categoria: CategoriaRelatorio;
    de?: string; ate?: string; projecaoAte?: string;
    /** Qual forma de pagamento, ou qual plano. As outras categorias ignoram. */
    filtro?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { admin } = await autorizar(context.userId, data.partnerId);
    // Duas funções, uma porta. A tela chama sempre a mesma coisa; quem sabe
    // onde cada categoria mora é aqui.
    const extra = CATEGORIAS_EXTRA.has(data.categoria);
    const { data: r, error } = await admin.rpc(
      (extra ? "academia_relatorio_pessoas_extra" : "academia_relatorio_pessoas") as never,
      {
        p_partner_id: data.partnerId,
        p_categoria: data.categoria,
        p_de: data.de ?? null,
        p_ate: data.ate ?? null,
        ...(extra ? { p_projecao_ate: data.projecaoAte ?? null, p_filtro: data.filtro ?? null } : {}),
      } as never,
    );
    if (error) throw new Error(error.message);
    return {
      pessoas: (r ?? []) as unknown as Array<{
        nome: string; telefone: string | null; referencia: string | null;
        student_id: string | null; credencial_id: string | null;
        valido_ate: string | null; dias: number | null; detalhe: string | null;
      }>,
    };
  });
