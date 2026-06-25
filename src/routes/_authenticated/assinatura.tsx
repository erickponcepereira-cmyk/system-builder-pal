import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Calendar, CheckCircle2, Loader2, Wallet as WalletIcon, XCircle } from "lucide-react";
import { SubscriptionInvoicesTab } from "@/components/profile/SubscriptionInvoicesTab";
import { getMySubscription } from "@/lib/subscriptions.functions";
import { getMyAnnualActivation } from "@/lib/annual-activation.functions";

export const Route = createFileRoute("/_authenticated/assinatura")({
  head: () => ({
    meta: [
      { title: "Assinatura — FitMind Club" },
      { name: "description", content: "Sua mensalidade e anuidade FitMind." },
    ],
  }),
  component: AssinaturaPage,
});

type TabKey = "monthly" | "annual";
type Role = "coach" | "professional" | "partner";

const fmt = (n: number) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

function AssinaturaPage() {
  const [tab, setTab] = useState<TabKey>("monthly");
  const [walletSource, setWalletSource] = useState<Role>("coach");
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  const [annual, setAnnual] = useState<any>(null);
  const [annualLoading, setAnnualLoading] = useState(true);

  const fnGet = useServerFn(getMySubscription);
  const fnAnnual = useServerFn(getMyAnnualActivation);

  useEffect(() => {
    (async () => {
      try {
        const r = await fnGet();
        const wallets = r?.wallets ?? {};
        const roles: Role[] = [];
        // Mostra apenas papéis com saldo > 0 (ou pelo menos coach se nada existir)
        (["coach", "professional", "partner"] as Role[]).forEach((k) => {
          if ((wallets as any)[k] !== undefined && (wallets as any)[k] !== null) roles.push(k);
        });
        const effective = roles.length ? roles : (["coach"] as Role[]);
        setAvailableRoles(effective);
        // padrão: papel com maior saldo
        let best: Role = effective[0];
        let bestVal = -1;
        effective.forEach((k) => {
          const v = Number((wallets as any)[k] || 0);
          if (v > bestVal) { bestVal = v; best = k; }
        });
        setWalletSource(best);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setAnnualLoading(true);
      try {
        const r = await fnAnnual();
        setAnnual(r);
      } finally {
        setAnnualLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0707] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0707]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/portal-selector" className="rounded-lg p-2 hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold">Assinatura</h1>
        </div>

        <div className="mx-auto flex max-w-3xl gap-1 px-4 pb-2">
          <button
            onClick={() => setTab("monthly")}
            className={`flex-1 rounded-t-lg px-4 py-2 text-sm font-bold ${tab === "monthly" ? "bg-primary text-black" : "bg-white/5 text-white/60"}`}
          >
            Mensalidade
          </button>
          <button
            onClick={() => setTab("annual")}
            className={`flex-1 rounded-t-lg px-4 py-2 text-sm font-bold ${tab === "annual" ? "bg-primary text-black" : "bg-white/5 text-white/60"}`}
          >
            Anuidade
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {tab === "monthly" && (
          <>
            {availableRoles.length > 1 && (
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="mb-2 flex items-center gap-2 text-xs uppercase text-white/60">
                  <WalletIcon className="h-3 w-3" /> Carteira para débito
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map((r) => (
                    <button
                      key={r}
                      onClick={() => setWalletSource(r)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${walletSource === r ? "bg-primary text-black" : "bg-white/10 text-white/70"}`}
                    >
                      {r === "coach" ? "Coach" : r === "professional" ? "Profissional" : "Parceiro"}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-white/40">
                  Sua mensalidade é única e vale para todas as plataformas. Escolha de qual carteira descontar.
                </p>
              </div>
            )}
            {loading ? (
              <div className="flex items-center gap-2 p-6 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : (
              <SubscriptionInvoicesTab walletSource={walletSource} />
            )}
          </>
        )}

        {tab === "annual" && (
          <div className="space-y-4">
            {annualLoading ? (
              <div className="flex items-center gap-2 p-6 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando anuidade…
              </div>
            ) : annual?.product ? (
              <>
                <div className={`rounded-2xl border p-5 ${annual.active ? "border-emerald-500/40 bg-emerald-500/10" : "border-orange-500/40 bg-orange-500/10"}`}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase text-white/50">{annual.product.name}</p>
                      <h2 className="text-2xl font-bold">{fmt(annual.product.price)}</h2>
                      <p className="mt-1 text-xs text-white/60">
                        Renovação anual única — vale para todas as plataformas.
                      </p>
                    </div>
                    {annual.active ? (
                      <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                    ) : (
                      <XCircle className="h-8 w-8 text-orange-400" />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-black/30 p-3">
                      <p className="text-xs uppercase text-white/40">Status</p>
                      <p className="font-bold">
                        {annual.active ? "Ativa" : annual.source === "none" ? "Não iniciada" : "Vencida"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-black/30 p-3">
                      <p className="text-xs uppercase text-white/40 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Válida até
                      </p>
                      <p className="font-bold">{fmtDate(annual.validUntil)}</p>
                    </div>
                  </div>

                  {annual.active && annual.daysRemaining <= 30 && (
                    <p className="mt-3 rounded-lg bg-orange-500/20 px-3 py-2 text-xs text-orange-200">
                      Faltam {annual.daysRemaining} dias para a renovação.
                    </p>
                  )}

                  {annual.source === "exempt" && (
                    <p className="mt-3 text-xs text-white/50">
                      Você é isento: a anuidade começa a contar a partir da finalização do seu cadastro.
                    </p>
                  )}
                </div>

                {!annual.active && annual.isCoach && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
                    Para renovar sua anuidade, conclua a compra de <strong>{annual.product.name}</strong> pelo fluxo de ativação de coach.
                  </div>
                )}
              </>
            ) : (
              <p className="p-6 text-center text-white/60">Produto de anuidade não configurado.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
