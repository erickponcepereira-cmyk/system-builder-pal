import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Globe2, Loader2, RefreshCw, ShieldAlert, Trash2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

type DiagnosticState = {
  href: string;
  origin: string;
  protocol: string;
  host: string;
  userAgent: string;
  online: boolean;
  serviceWorkerSupported: boolean;
  controller: boolean;
  registrations: string[];
  storageCleared: boolean;
};

const initialState: DiagnosticState = {
  href: "",
  origin: "",
  protocol: "",
  host: "",
  userAgent: "",
  online: true,
  serviceWorkerSupported: false,
  controller: false,
  registrations: [],
  storageCleared: false,
};

export const Route = createFileRoute("/diagnostico")({
  head: () => ({
    meta: [
      { title: "Diagnóstico de acesso — FitMind Club" },
      { name: "description", content: "Verifique e limpe dados locais de acesso ao FitMind Club." },
      { property: "og:title", content: "Diagnóstico de acesso — FitMind Club" },
      { property: "og:description", content: "Verifique e limpe dados locais de acesso ao FitMind Club." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiagnosticsPage,
});

async function readState(): Promise<DiagnosticState> {
  if (typeof window === "undefined") return initialState;

  const serviceWorkerSupported = "serviceWorker" in navigator;
  const registrations = serviceWorkerSupported
    ? await navigator.serviceWorker
        .getRegistrations()
        .then((items) =>
          items.map((item) => item.active?.scriptURL || item.waiting?.scriptURL || item.installing?.scriptURL || "registro pendente"),
        )
        .catch(() => [])
    : [];

  return {
    href: window.location.href,
    origin: window.location.origin,
    protocol: window.location.protocol,
    host: window.location.host,
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    serviceWorkerSupported,
    controller: Boolean(navigator.serviceWorker?.controller),
    registrations,
    storageCleared: false,
  };
}

async function clearLocalAccessData() {
  if (typeof window === "undefined") return;

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.allSettled(
      registrations.map((registration) => {
        const scriptUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "";
        if (scriptUrl.includes("firebase-messaging") || scriptUrl.includes("OneSignal")) return Promise.resolve(false);
        return registration.unregister();
      }),
    );
  }

  if ("caches" in window) {
    const cacheNames = await caches.keys().catch(() => []);
    await Promise.allSettled(
      cacheNames
        .filter((name) => /(^|-)precache-v\d+-|(^|-)runtime-|^html$|^workbox-/.test(name))
        .map((name) => caches.delete(name)),
    );
  }
}

function DiagnosticsPage() {
  const [state, setState] = useState<DiagnosticState>(initialState);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const cleanUrl = useMemo(() => {
    if (!state.origin) return "";
    return `${state.origin}/diagnostico?sw=off`;
  }, [state.origin]);

  useEffect(() => {
    let active = true;
    void readState().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleClear = async () => {
    setBusy(true);
    try {
      await clearLocalAccessData();
      const next = await readState();
      setState({ ...next, storageCleared: true });
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!cleanUrl) return;
    await navigator.clipboard?.writeText(cleanUrl).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <Logo className="h-11 w-11 object-contain" />
          <div>
            <h1 className="text-xl font-bold">Diagnóstico de acesso</h1>
            <p className="text-sm text-muted-foreground">FitMind Club</p>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            {state.host ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /> : <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />}
            <div>
              <h2 className="text-base font-semibold">Se esta tela abriu, o domínio carregou neste aparelho.</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Se outro celular ainda mostra conexão encerrada antes desta tela, o bloqueio acontece antes do app abrir.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <InfoItem icon={<Globe2 />} label="Domínio" value={state.host || "verificando"} />
          <InfoItem icon={<Wifi />} label="Conexão do navegador" value={state.online ? "online" : "offline"} />
          <InfoItem icon={<ShieldAlert />} label="Protocolo" value={state.protocol || "verificando"} />
          <InfoItem icon={<RefreshCw />} label="Service worker" value={state.registrations.length ? `${state.registrations.length} ativo(s)` : "nenhum ativo"} />
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Limpeza deste aparelho</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Remove cache local antigo do app neste navegador. Não apaga cadastro, compras ou dados da conta.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button type="button" onClick={handleClear} disabled={busy} className="w-full sm:w-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Limpar acesso local
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.reload()} className="w-full sm:w-auto">
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </Button>
          </div>
          {state.storageCleared && (
            <p className="mt-3 text-sm font-medium text-success">Limpeza concluída. Recarregue e tente acessar novamente.</p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Link de recuperação</h2>
          <p className="mt-1 break-all rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{cleanUrl || "Carregando link..."}</p>
          <Button type="button" variant="outline" onClick={handleCopy} className="mt-3 w-full sm:w-auto">
            <Copy className="h-4 w-4" />
            {copied ? "Copiado" : "Copiar link"}
          </Button>
        </section>

        <details className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <summary className="cursor-pointer text-foreground">Detalhes técnicos</summary>
          <dl className="mt-3 space-y-2 break-all">
            <Detail label="URL" value={state.href} />
            <Detail label="Origem" value={state.origin} />
            <Detail label="Controlado por SW" value={state.controller ? "sim" : "não"} />
            <Detail label="SW suportado" value={state.serviceWorkerSupported ? "sim" : "não"} />
            <Detail label="Registros" value={state.registrations.join(" | ") || "nenhum"} />
            <Detail label="Navegador" value={state.userAgent} />
          </dl>
        </details>

        <Button asChild variant="link" className="self-center">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </div>
    </main>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-primary [&_svg]:h-4 [&_svg]:w-4">{icon}<span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span></div>
      <p className="mt-2 break-all text-sm font-semibold text-card-foreground">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-foreground">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}