import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrdersInProgressPanel } from "@/components/shipping/OrdersInProgressPanel";
import { ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/partner/orders-in-progress")({
  component: PartnerOrdersInProgressPage,
  head: () => ({ meta: [{ title: "Compras em andamento — Parceiro" }] }),
});

function PartnerOrdersInProgressPage() {
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setLoading(false); return; }
      const { data: p } = await supabase.from("profiles").select("id").eq("user_id", u.user.id).maybeSingle();
      if (!p) { setLoading(false); return; }
      const { data: pt } = await supabase.from("partners").select("id").eq("profile_id", (p as any).id).maybeSingle();
      setPartnerId((pt as any)?.id || null);
      setLoading(false);
    })();
  }, []);
  return (
    <div className="min-h-screen bg-background pb-20 pt-4">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center gap-3">
          <Link to="/partner" className="rounded-full bg-white/5 p-2 text-white/70 hover:text-white"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-lg font-bold text-white">Compras em andamento</h1>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : partnerId ? (
          <OrdersInProgressPanel scope="partner" partnerId={partnerId} />
        ) : (
          <p className="text-sm text-white/60">Parceiro não encontrado.</p>
        )}
      </div>
    </div>
  );
}
