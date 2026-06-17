import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { checkMyBlockStatus } from "@/lib/subscriptions.functions";
import { SubscriptionInvoicesTab } from "./SubscriptionInvoicesTab";

interface Props {
  walletSource: "coach" | "partner" | "professional";
  children: ReactNode;
}

/**
 * Bloqueia o acesso ao painel quando a mensalidade está em atraso (D+3+).
 * Exibe apenas a tela de faturas com aviso vermelho.
 */
export function SubscriptionGuard({ walletSource, children }: Props) {
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const fnCheck = useServerFn(checkMyBlockStatus);

  useEffect(() => {
    let active = true;
    fnCheck()
      .then((r) => { if (active) setBlocked(Boolean((r as any)?.blocked)); })
      .catch(() => { if (active) setBlocked(false); });
    return () => { active = false; };
  }, []);

  if (blocked === null) return <>{children}</>;
  if (!blocked) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <div>
            <p className="font-bold text-red-300">Painel bloqueado por mensalidade em atraso</p>
            <p className="text-sm text-red-200/80">Quite a fatura abaixo para liberar o acesso completo ao sistema.</p>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-5xl p-4">
        <SubscriptionInvoicesTab walletSource={walletSource} />
      </div>
    </div>
  );
}

export default SubscriptionGuard;
