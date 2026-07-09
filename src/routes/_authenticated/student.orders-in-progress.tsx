import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrdersInProgressPanel } from "@/components/shipping/OrdersInProgressPanel";
import { ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/student/orders-in-progress")({
  component: OrdersInProgressPage,
  head: () => ({ meta: [{ title: "Compras em andamento" }] }),
});

function OrdersInProgressPage() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setLoading(false); return; }
      const { data: p } = await supabase.from("profiles").select("id").eq("user_id", u.user.id).maybeSingle();
      if (!p) { setLoading(false); return; }
      const { data: s } = await supabase.from("students").select("id").eq("profile_id", (p as any).id).maybeSingle();
      setStudentId((s as any)?.id || null);
      setLoading(false);
    })();
  }, []);
  return (
    <div className="min-h-screen bg-background pb-20 pt-4">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center gap-3">
          <Link to="/student/profile" className="rounded-full bg-white/5 p-2 text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-bold text-white">Compras em andamento</h1>
        </div>
        <p className="mb-4 text-xs text-white/60">
          Acompanhe suas compras físicas: endereço de entrega, prazo médio e contador em dias.
        </p>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : studentId ? (
          <OrdersInProgressPanel scope="student" studentId={studentId} />
        ) : (
          <p className="text-sm text-white/60">Conta de aluno não encontrada.</p>
        )}
      </div>
    </div>
  );
}
