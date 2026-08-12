import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function InstallAppButton({ className = "" }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  if (!mounted) return <div className="h-[46px] w-full" aria-hidden />;
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
    // iOS has no programmatic install prompt — show the Apple-supported flow.
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
        {platform === "ios" ? "Instalar FitMind no iPhone" : "Ainda não tem nossa versão app? Baixe agora!"}
      </button>

      {showIosHelp && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[2147483000] flex justify-center p-4 overscroll-contain modal-safe items-center"
            style={{ backgroundColor: "rgba(0,0,0,0.7)", isolation: "isolate" }}
            onClick={() => setShowIosHelp(false)}
          >
            <div
              className="relative w-full max-w-sm rounded-2xl border border-white/10 p-6"
              style={{
                backgroundColor: "#161616",
                color: "#FFFFFF",
                position: "relative",
                zIndex: 1,
                paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowIosHelp(false)}
                className="absolute right-3 top-3"
                style={{ color: "rgba(255,255,255,0.6)" }}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="mb-3 flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                <h3 className="text-base font-bold" style={{ color: "#FFFFFF" }}>
                  Instalar o app FitMind
                </h3>
              </div>
              {platform === "ios" ? (
                <ol className="space-y-2 text-sm" style={{ color: "rgba(255,255,255,0.82)" }}>
                  {!isIosSafari() && <li>1. Abra este site no <strong>Safari</strong> do iPhone.</li>}
                  <li>{isIosSafari() ? "1" : "2"}. Toque no botão <strong>Compartilhar</strong> (quadrado com seta) na barra inferior.</li>
                  <li>{isIosSafari() ? "2" : "3"}. Toque em <strong>“Adicionar à Tela de Início”</strong>.</li>
                  <li>{isIosSafari() ? "3" : "4"}. Confirme em <strong>Adicionar</strong>. No iPhone, esse é o modo de instalar apps web.</li>
                </ol>
              ) : platform === "android" ? (
                <ol className="space-y-2 text-sm" style={{ color: "rgba(255,255,255,0.82)" }}>
                  <li>1. Toque no menu <strong>⋮</strong> do navegador (Chrome).</li>
                  <li>2. Selecione <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong>.</li>
                  <li>3. Confirme em <strong>Instalar</strong>.</li>
                </ol>
              ) : (
                <ol className="space-y-2 text-sm" style={{ color: "rgba(255,255,255,0.82)" }}>
                  <li>1. Abra esta página no navegador do seu celular.</li>
                  <li>2. Use a opção <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong> do navegador.</li>
                </ol>
              )}
              <button
                type="button"
                onClick={() => setShowIosHelp(false)}
                className="mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-bold"
                style={{ backgroundColor: "var(--primary, #FF4230)", color: "#FFFFFF" }}
              >
                Entendi
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
