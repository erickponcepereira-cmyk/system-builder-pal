/**
 * Modo coach da loja unificada — dados e venda para aluno.
 *
 * Cópia do que `StorePage.tsx` faz quando `coachMode` é verdadeiro, mantida
 * fora do componente pelo mesmo motivo do carrinho e do checkout: a vitrine
 * nova não pode virar outro arquivo de 1800 linhas.
 *
 * A diferença que organiza tudo aqui: **o coach não compra, ele vende.** O
 * pedido nasce no nome de um aluno escolhido, e sem aluno escolhido não há
 * pedido nenhum. Por isso o seletor de aluno não é um detalhe de tela — é
 * pré-condição do checkout inteiro.
 */

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";

export type SaleClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf?: string | null;
  /** Coach vinculado ao aluno. O master vende para aluno de outro coach. */
  coachName?: string | null;
};

export type CoachSaleRow = {
  orderId: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string | null;
  paymentMethod: string;
  clientName: string;
  productTitles: string;
};

export type CoachContext = {
  coachId: string | null;
  isMaster: boolean;
  /**
   * Coach **sem** upline fica com os três níveis da rede, porque não há para
   * onde subir. Muda o total que ele vê antes de vender, então vem daqui e não
   * por prop: quem sabe a cadeia é quem consultou a linha do coach.
   */
  hasUpline: boolean;
  clients: SaleClient[];
  sales: CoachSaleRow[];
};

export const EMPTY_COACH_CONTEXT: CoachContext = {
  coachId: null,
  isMaster: false,
  hasUpline: false,
  clients: [],
  sales: [],
};

/**
 * Carrega quem o coach é, para quem ele pode vender e o que já vendeu.
 *
 * A lista de alunos vem de `list_coach_team_clients` (RPC security-definer, que
 * já resolve a equipe inteira). O nome do coach de cada aluno é enriquecido
 * depois, numa consulta só: o master vende para aluno que não é dele, e sem
 * esse rótulo ele não sabe de quem é o aluno que está selecionando.
 */
export async function loadCoachContext(): Promise<CoachContext> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return EMPTY_COACH_CONTEXT;

  const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", u.user.id).maybeSingle();
  if (!prof) return EMPTY_COACH_CONTEXT;

  const { data: coach } = await supabase
    .from("coaches")
    .select("id,upline_coach_id")
    .eq("profile_id", prof.id)
    .maybeSingle();
  if (!coach) return EMPTY_COACH_CONTEXT;

  const coachId = String(coach.id);
  const hasUpline = !!coach.upline_coach_id;

  const { data: masterFlag } = await supabase.rpc("is_master_coach" as never, { _coach_id: coachId } as never);

  const { data: clientRows, error: clientsError } = await supabase.rpc("list_coach_team_clients" as never);
  if (clientsError) toast.error(clientsError.message || "Erro ao carregar alunos da equipe");

  const clients: SaleClient[] = ((clientRows || []) as Array<Record<string, unknown>>).map((s) => ({
    id: String(s.id),
    name: (s.name as string) || "Cliente",
    email: (s.email as string) || null,
    phone: (s.phone as string) || null,
    cpf: (s.cpf as string) || null,
    coachName: null,
  }));

  if (clients.length) {
    const { data: stu } = await supabase
      .from("students")
      .select("id,coach:coaches!students_coach_id_fkey(profiles:profile_id(name))")
      .in("id", clients.map((c) => c.id));
    const porAluno = new Map<string, string | null>();
    type LinhaAluno = { id: string; coach: { profiles: { name: string | null } | null } | null };
    ((stu || []) as unknown as LinhaAluno[]).forEach((r) => {
      porAluno.set(String(r.id), r.coach?.profiles?.name || null);
    });
    clients.forEach((c) => { c.coachName = porAluno.get(c.id) || null; });
  }

  const sales = await loadCoachSales(coachId, clients.map((c) => c.id));

  return { coachId, isMaster: !!masterFlag, hasUpline, clients, sales };
}

/**
 * Vendas do coach: pedidos dos alunos dele mais os que ele mesmo criou.
 *
 * O `or` cobre os dois casos porque um master coach cria pedido para aluno que
 * não está na equipe dele — só o filtro por `student_id` deixaria essa venda
 * invisível para quem a fez.
 */
async function loadCoachSales(coachId: string, studentIds: string[]): Promise<CoachSaleRow[]> {
  const filtro = [
    studentIds.length ? `student_id.in.(${studentIds.join(",")})` : null,
    `metadata->>created_by_coach_id.eq.${coachId}`,
  ].filter(Boolean).join(",");

  const { data: orders } = await supabase
    .from("store_orders" as never)
    .select("id, order_number, status, total_amount, created_at, payment_method, student_id, students:student_id(profiles:profile_id(name)), store_order_items(title)" as never)
    .or(filtro as never)
    .order("created_at" as never, { ascending: false })
    .limit(100);

  type LinhaVenda = {
    id: string;
    order_number: string | null;
    status: string | null;
    total_amount: number | null;
    created_at: string | null;
    payment_method: string | null;
    students: { profiles: { name: string | null } | null } | null;
    store_order_items: Array<{ title: string }> | null;
  };

  return ((orders || []) as unknown as LinhaVenda[]).map((o) => ({
    orderId: String(o.id),
    orderNumber: o.order_number || "",
    status: o.status || "",
    total: Number(o.total_amount || 0),
    createdAt: o.created_at || null,
    paymentMethod: o.payment_method || "",
    clientName: o.students?.profiles?.name || "Cliente",
    productTitles: (o.store_order_items || []).map((i) => i.title).join(", ") || "—",
  }));
}

/** Contexto do coach, carregado uma vez e recarregável depois de vender. */
export function useCoachContext(ativo: boolean) {
  const [ctx, setCtx] = useState<CoachContext>(EMPTY_COACH_CONTEXT);
  const [carregando, setCarregando] = useState(ativo);

  const recarregar = useCallback(async () => {
    if (!ativo) return;
    try {
      setCtx(await loadCoachContext());
    } catch (erro) {
      console.error("[loja nova] contexto do coach", erro);
    } finally {
      setCarregando(false);
    }
  }, [ativo]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  return { ...ctx, carregando, recarregar };
}
