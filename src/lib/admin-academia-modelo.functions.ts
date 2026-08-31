import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export type ModeloResumo = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  updatedAt: string | null;
  origem: string | null;
  planos: number;
  avisos: number;
  turmas: number;
  temConfig: boolean;
};

export type ItemDoRelato = {
  item: string | null;
  acao: string;
  motivo?: string;
};

export type SecaoDoRelato = {
  resumo: Record<string, number>;
  itens: ItemDoRelato[];
};

export type RelatoAplicacao = {
  ok: boolean;
  simulado: boolean;
  sobrescrever: boolean;
  parceiro: string;
  modelo: string;
  quando: string;
  secoes_ignoradas: string[];
  secoes: Record<string, SecaoDoRelato>;
};

export type AcademiaConfigurada = {
  partnerId: string;
  nome: string | null;
  timezone: string;
  modeloCatraca: string | null;
  planos: number;
  avisos: number;
  turmas: number;
};

export type ParceiroBusca = {
  id: string;
  nome: string | null;
  status: string | null;
  jaEAcademia: boolean;
};

async function conectarComoAdmin(userId: string) {
  const { assertAdminProfile } = await import("./admin-network.server");
  await assertAdminProfile(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function contarSecao(conteudo: unknown, secao: string): number {
  const bloco = (conteudo as Record<string, unknown> | null)?.[secao];
  return Array.isArray(bloco) ? bloco.length : 0;
}

function nomeDaOrigem(conteudo: unknown): string | null {
  const origem = (conteudo as Record<string, unknown> | null)?.origem;
  const nome = (origem as Record<string, unknown> | null)?.nome;
  return typeof nome === "string" ? nome : null;
}

export const listarModelosAcademia = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ModeloResumo[]> => {
    const supabaseAdmin = await conectarComoAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("academia_modelos")
      .select("id, nome, descricao, ativo, updated_at, conteudo")
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);

    return (data || []).map((m) => ({
      id: m.id as string,
      nome: m.nome as string,
      descricao: (m.descricao as string) ?? null,
      ativo: m.ativo as boolean,
      updatedAt: (m.updated_at as string) ?? null,
      origem: nomeDaOrigem(m.conteudo),
      planos: contarSecao(m.conteudo, "planos"),
      avisos: contarSecao(m.conteudo, "avisos"),
      turmas: contarSecao(m.conteudo, "turmas"),
      temConfig: Boolean((m.conteudo as Record<string, unknown> | null)?.config),
    }));
  });

export const obterConteudoDoModelo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ modeloId: z.string().uuid() }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<{ conteudo: string }> => {
    const supabaseAdmin = await conectarComoAdmin(context.userId);
    const { data: modelo, error } = await supabaseAdmin
      .from("academia_modelos")
      .select("conteudo")
      .eq("id", data.modeloId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!modelo) throw new Error("Modelo não encontrado");
    return { conteudo: JSON.stringify(modelo.conteudo, null, 2) };
  });

export const salvarModeloAcademia = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        modeloId: z.string().uuid().nullable(),
        nome: z.string().min(2).max(120),
        descricao: z.string().max(1000).nullable(),
        conteudo: z.string().min(2),
        ativo: z.boolean(),
      })
      .parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<{ modeloId: string }> => {
    const supabaseAdmin = await conectarComoAdmin(context.userId);

    let conteudo: unknown;
    try {
      conteudo = JSON.parse(data.conteudo);
    } catch {
      throw new Error("O conteúdo do modelo não é um JSON válido.");
    }
    if (!conteudo || typeof conteudo !== "object" || Array.isArray(conteudo)) {
      throw new Error("O conteúdo do modelo precisa ser um objeto com uma seção por assunto.");
    }

    const campos = {
      nome: data.nome.trim(),
      descricao: data.descricao?.trim() || null,
      // A coluna e jsonb; o valor ja foi validado como objeto logo acima.
      conteudo: conteudo as Json,
      ativo: data.ativo,
    };

    if (data.modeloId) {
      const { error } = await supabaseAdmin
        .from("academia_modelos")
        .update(campos)
        .eq("id", data.modeloId);
      if (error) throw new Error(error.message);
      return { modeloId: data.modeloId };
    }

    const { data: criado, error } = await supabaseAdmin
      .from("academia_modelos")
      .insert(campos)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { modeloId: criado.id as string };
  });

export const excluirModeloAcademia = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ modeloId: z.string().uuid() }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const supabaseAdmin = await conectarComoAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("academia_modelos")
      .delete()
      .eq("id", data.modeloId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Congela a configuração atual de uma academia que já funciona como modelo novo. */
export const salvarAcademiaComoModelo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        partnerId: z.string().uuid(),
        nome: z.string().min(2).max(120),
        descricao: z.string().max(1000).nullable(),
      })
      .parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<{ modeloId: string }> => {
    const supabaseAdmin = await conectarComoAdmin(context.userId);

    const { data: conteudo, error: erroExtrair } = await supabaseAdmin.rpc(
      "academia_modelo_do_partner" as never,
      { p_partner_id: data.partnerId } as never,
    );
    if (erroExtrair) throw new Error(erroExtrair.message);

    const { data: criado, error } = await supabaseAdmin
      .from("academia_modelos")
      .insert({
        nome: data.nome.trim(),
        descricao: data.descricao?.trim() || null,
        conteudo: conteudo as Json,
        ativo: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { modeloId: criado.id as string };
  });

/**
 * Aplica o modelo. `simular` roda a mesma função sem gravar nada: é a prévia
 * que a tela mostra antes de pedir confirmação.
 */
export const aplicarModeloAcademia = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        partnerId: z.string().uuid(),
        modeloId: z.string().uuid(),
        sobrescrever: z.boolean(),
        simular: z.boolean(),
      })
      .parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<RelatoAplicacao> => {
    const supabaseAdmin = await conectarComoAdmin(context.userId);
    const { data: relato, error } = await supabaseAdmin.rpc(
      "academia_modelo_aplicar" as never,
      {
        p_partner_id: data.partnerId,
        p_modelo_id: data.modeloId,
        p_sobrescrever: data.sobrescrever,
        p_simular: data.simular,
      } as never,
    );
    if (error) throw new Error(error.message);
    return relato as unknown as RelatoAplicacao;
  });

export const listarAcademiasConfiguradas = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<AcademiaConfigurada[]> => {
    const supabaseAdmin = await conectarComoAdmin(context.userId);

    const { data: configs, error } = await supabaseAdmin
      .from("partner_acesso_config")
      .select("partner_id, timezone, modelo_catraca");
    if (error) throw new Error(error.message);

    const ids = (configs || []).map((c) => c.partner_id as string);
    if (ids.length === 0) return [];

    const [parceiros, planos, avisos, turmas] = await Promise.all([
      supabaseAdmin.from("partners").select("id, fantasy_name").in("id", ids),
      supabaseAdmin.from("academia_planos").select("partner_id").in("partner_id", ids),
      supabaseAdmin.from("academia_avisos_modelos").select("partner_id").in("partner_id", ids),
      supabaseAdmin.from("academia_turmas").select("partner_id").in("partner_id", ids),
    ]);

    const nomePorId = new Map<string, string | null>(
      (parceiros.data || []).map((p) => [p.id as string, (p.fantasy_name as string) ?? null]),
    );
    const contar = (linhas: { partner_id: unknown }[] | null, id: string) =>
      (linhas || []).filter((l) => l.partner_id === id).length;

    return (configs || []).map((c) => {
      const id = c.partner_id as string;
      return {
        partnerId: id,
        nome: nomePorId.get(id) ?? null,
        timezone: c.timezone as string,
        modeloCatraca: (c.modelo_catraca as string) ?? null,
        planos: contar(planos.data, id),
        avisos: contar(avisos.data, id),
        turmas: contar(turmas.data, id),
      };
    });
  });

export const buscarParceiros = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ q: z.string().min(2).max(120) }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<ParceiroBusca[]> => {
    const supabaseAdmin = await conectarComoAdmin(context.userId);

    const { data: encontrados, error } = await supabaseAdmin
      .from("partners")
      .select("id, fantasy_name, status")
      .ilike("fantasy_name", `%${data.q.trim()}%`)
      .order("fantasy_name", { ascending: true })
      .limit(30);
    if (error) throw new Error(error.message);

    const ids = (encontrados || []).map((p) => p.id as string);
    const { data: configs } = await supabaseAdmin
      .from("partner_acesso_config")
      .select("partner_id")
      .in("partner_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const jaSaoAcademia = new Set((configs || []).map((c) => c.partner_id as string));

    return (encontrados || []).map((p) => ({
      id: p.id as string,
      nome: (p.fantasy_name as string) ?? null,
      status: (p.status as string) ?? null,
      jaEAcademia: jaSaoAcademia.has(p.id as string),
    }));
  });
