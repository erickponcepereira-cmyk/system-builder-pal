import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, User } from "lucide-react";
import { checkMyBlockStatus } from "@/lib/subscriptions.functions";
import { SubscriptionInvoicesTab } from "./SubscriptionInvoicesTab";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  walletSource: "coach" | "partner" | "professional";
  children: ReactNode;
}

/**
 * Bloqueia o acesso ao painel quando a mensalidade está em atraso (D+3+).
 * Exibe apenas a tela de faturas com aviso vermelho.
 * O Painel de Aluno permanece sempre acessível, independente do bloqueio.
 */
export function SubscriptionGuard({ walletSource, children }: Props) {
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [hasStudent, setHasStudent] = useState(false);
  const fnCheck = useServerFn(checkMyBlockStatus);

  useEffect(() => {
    let active = true;
    fnCheck()
      .then((r) => { if (active) setBlocked(Boolean((r as any)?.blocked)); })
      .catch(() => { if (active) setBlocked(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
        if (!profile?.id) return;
        const { data: student } = await supabase
          .from("students").select("id").eq("profile_id", profile.id).maybeSingle();
        if (active) setHasStudent(!!student?.id);
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, []);

  if (blocked === null) return <>{children}</>;
  if (!blocked) return <>{children}</>;

  const goToStudent = () => {
    try { sessionStorage.setItem("fitmind_selected_area", "student"); } catch { /* ignore */ }
    window.location.href = "/student";
  };

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <div className="flex-1">
            <p className="font-bold text-red-300">Painel bloqueado por mensalidade em atraso</p>
            <p className="text-sm text-red-200/80">Quite a fatura abaixo para liberar o acesso completo ao sistema.</p>
          </div>
        </div>
        {hasStudent && (
          <div className="mx-auto mt-3 flex max-w-5xl">
            <button
              onClick={goToStudent}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-black hover:bg-primary/90"
            >
              <User className="h-4 w-4" />
              Entrar no Painel de Aluno
            </button>
          </div>
        )}
      </div>
      <div className="mx-auto max-w-5xl p-4">
        <SubscriptionInvoicesTab walletSource={walletSource} />
      </div>
    </div>
  );
}

export default SubscriptionGuard;
