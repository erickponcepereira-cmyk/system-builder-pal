import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";

export type ProductDownloadRow = {
  id: string;
  product_id: string;
  product_name: string | null;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  sort_order: number;
};

// ---------------------------------------------------------------------------
// Lista todos os arquivos disponíveis para download dos produtos que o
// aluno autenticado JÁ COMPROU (status pago). Também retorna a lista para
// admins (todos os arquivos) — usado pela tela do aluno em /student/downloads.
// ---------------------------------------------------------------------------
export const listMyProductDownloads = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProductDownloadRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile) return [];

    const isAdmin = (profile as any).role === "admin";

    // Coletar product_ids comprados (pagos)
    const purchasedIds = new Set<string>();

    if (!isAdmin) {
      const { data: student } = await supabaseAdmin
        .from("students")
        .select("id")
        .eq("profile_id", (profile as any).id)
        .maybeSingle();
      const studentId = student?.id as string | undefined;
      if (!studentId) return [];

      const [{ data: txs }, { data: orders }] = await Promise.all([
        supabaseAdmin
          .from("transactions")
          .select("product_id, status")
          .eq("student_id", studentId)
          .eq("status", "paid"),
        supabaseAdmin
          .from("store_orders")
          .select("id, status")
          .eq("student_id", studentId)
          .eq("status", "paid"),
      ]);
      ((txs as any[]) || []).forEach((t) => t.product_id && purchasedIds.add(t.product_id));
      const orderIds = ((orders as any[]) || []).map((o) => o.id);
      if (orderIds.length) {
        const { data: items } = await supabaseAdmin
          .from("store_order_items")
          .select("order_id, product_id, store_product_id")
          .in("order_id", orderIds);
        ((items as any[]) || []).forEach((it) => {
          const pid = it.product_id || it.store_product_id;
          if (pid) purchasedIds.add(pid);
        });
      }
      if (purchasedIds.size === 0) return [];
    }

    let query = (supabaseAdmin as any)
      .from("product_downloads")
      .select("id, product_id, name, mime_type, size_bytes, sort_order, products!product_downloads_product_id_fkey(name)")
      .order("sort_order", { ascending: true });
    if (!isAdmin) query = query.in("product_id", Array.from(purchasedIds));

    const { data } = await query;
    return ((data as any[]) || []).map((r) => ({
      id: r.id,
      product_id: r.product_id,
      product_name: r.products?.name ?? null,
      name: r.name,
      mime_type: r.mime_type,
      size_bytes: r.size_bytes,
      sort_order: r.sort_order,
    }));
  });

// ---------------------------------------------------------------------------
// Gera URL assinada (60 minutos) para baixar um arquivo. Verifica se o
// usuário é admin OU comprou o produto correspondente.
// ---------------------------------------------------------------------------
export const getProductDownloadSignedUrl = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { downloadId: string })
  .handler(async ({ data, context }): Promise<{ url: string; filename: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: dl } = await (supabaseAdmin as any)
      .from("product_downloads")
      .select("id, product_id, name, file_path")
      .eq("id", data.downloadId)
      .maybeSingle();
    if (!dl) throw new Error("Arquivo não encontrado");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado");

    const isAdmin = (profile as any).role === "admin";

    if (!isAdmin) {
      const { data: student } = await supabaseAdmin
        .from("students")
        .select("id")
        .eq("profile_id", (profile as any).id)
        .maybeSingle();
      const studentId = student?.id as string | undefined;
      if (!studentId) throw new Error("Compra não localizada para este arquivo");

      // Verifica compra paga do product_id
      const [{ data: tx }, { data: orders }] = await Promise.all([
        supabaseAdmin
          .from("transactions")
          .select("id")
          .eq("student_id", studentId)
          .eq("status", "paid")
          .eq("product_id", dl.product_id)
          .limit(1),
        supabaseAdmin
          .from("store_orders")
          .select("id")
          .eq("student_id", studentId)
          .eq("status", "paid"),
      ]);
      let ok = ((tx as any[]) || []).length > 0;
      if (!ok) {
        const orderIds = ((orders as any[]) || []).map((o: any) => o.id);
        if (orderIds.length) {
          const { data: items } = await supabaseAdmin
            .from("store_order_items")
            .select("id")
            .in("order_id", orderIds)
            .or(`product_id.eq.${dl.product_id},store_product_id.eq.${dl.product_id}`)
            .limit(1);
          ok = ((items as any[]) || []).length > 0;
        }
      }
      if (!ok) throw new Error("Compra não localizada para este arquivo");
    }

    const { data: signed, error } = await supabaseAdmin.storage
      .from("product-downloads")
      .createSignedUrl(dl.file_path, 60 * 60, { download: dl.name });
    if (error || !signed) throw new Error(error?.message || "Erro ao gerar link");

    return { url: signed.signedUrl, filename: dl.name };
  });

// ---------------------------------------------------------------------------
// Admin: lista arquivos de um produto (usado pelo editor).
// ---------------------------------------------------------------------------
export const listProductDownloadsForAdmin = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { productId: string })
  .handler(async ({ data, context }): Promise<ProductDownloadRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("role").eq("user_id", context.userId).maybeSingle();
    if ((profile as any)?.role !== "admin") throw new Error("Somente admin");
    const { data: rows } = await (supabaseAdmin as any)
      .from("product_downloads")
      .select("id, product_id, name, mime_type, size_bytes, sort_order")
      .eq("product_id", data.productId)
      .order("sort_order");
    return ((rows as any[]) || []).map((r) => ({ ...r, product_name: null }));
  });
