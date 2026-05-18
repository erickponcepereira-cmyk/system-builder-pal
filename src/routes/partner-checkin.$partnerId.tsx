import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/partner-checkin/$partnerId")({
  component: PartnerCheckin,
});

function PartnerCheckin() {
  const { partnerId } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "ok" | "error" | "noauth">("loading");
  const [msg, setMsg] = useState("");
  const [partnerName, setPartnerName] = useState("");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setState("noauth"); return; }
      const { data, error } = await supabase.rpc("partner_checkin" as never, { _partner_id: partnerId } as never);
      if (error) { setState("error"); setMsg(error.message); return; }
      const r = data as { ok?: boolean; partner_name?: string } | null;
      setPartnerName(r?.partner_name || "");
      setState("ok");
    })();
  }, [partnerId]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-sm text-center space-y-4">
        <Logo className="h-12 w-12 mx-auto" />
        {state === "loading" && <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />}
        {state === "ok" && (
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-green-500/15 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-400" />
            </div>
            <h1 className="text-lg font-bold text-white">Check-in confirmado!</h1>
            <p className="text-sm text-white/60 mt-1">Sua visita a <b className="text-white">{partnerName}</b> foi registrada no seu perfil.</p>
            <button onClick={() => navigate({ to: "/student" })} className="mt-4 w-full rounded bg-primary py-2 text-sm font-bold text-primary-foreground">Voltar ao app</button>
          </div>
        )}
        {state === "error" && (
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#1A1A1A" }}>
            <AlertTriangle className="h-10 w-10 text-orange-400 mx-auto mb-2" />
            <p className="text-sm text-white/80">{msg}</p>
          </div>
        )}
        {state === "noauth" && (
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#1A1A1A" }}>
            <p className="text-sm text-white/80 mb-3">Faça login como aluno para registrar sua visita.</p>
            <Link to="/login" className="block rounded bg-primary py-2 text-sm font-bold text-primary-foreground">Entrar</Link>
          </div>
        )}
      </div>
    </div>
  );
}
