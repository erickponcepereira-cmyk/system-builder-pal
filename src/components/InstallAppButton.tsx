import { useEffect, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export function InstallAppButton({ className = "" }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
      } catch {
        // ignore
      } finally {
        setDeferred(null);
      }
      return;
    }
    // iOS Safari has no programmatic install — show inline instructions
    setShowIosHelp(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          "group flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-primary/20 hover:border-primary/60 " +
          className
        }
      >
        <Download className="h-4 w-4 text-primary" />
        Ainda não tem nossa versão app? Baixe agora!
      </button>

      {showIosHelp && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={() => setShowIosHelp(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#161616] p-6 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowIosHelp(false)}
              className="absolute right-3 top-3 text-white/50 hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-3 flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold">Instalar o app FitMind</h3>
            </div>
            {platform === "ios" ? (
              <ol className="space-y-2 text-sm text-white/80">
                <li>1. Toque no botão <strong>Compartilhar</strong> (ícone de quadrado com seta) na barra inferior do Safari.</li>
                <li>2. Role e toque em <strong>“Adicionar à Tela de Início”</strong>.</li>
                <li>3. Confirme em <strong>Adicionar</strong>. Pronto: o app FitMind aparece na sua tela inicial.</li>
              </ol>
            ) : platform === "android" ? (
              <ol className="space-y-2 text-sm text-white/80">
                <li>1. Toque no menu <strong>⋮</strong> do navegador (Chrome).</li>
                <li>2. Selecione <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong>.</li>
                <li>3. Confirme em <strong>Instalar</strong>.</li>
              </ol>
            ) : (
              <ol className="space-y-2 text-sm text-white/80">
                <li>1. Abra esta página no navegador do seu celular.</li>
                <li>2. Use a opção <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong> do navegador.</li>
              </ol>
            )}
            <button
              type="button"
              onClick={() => setShowIosHelp(false)}
              className="mt-5 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
