import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload, Package, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  estadoDosPacotesBase,
  gerarEnvioDoPacoteBase,
  type EstadoBase,
} from "@/lib/admin-instalacao.functions";

/**
 * Publicação dos pacotes base — um por programa, para todas as academias.
 *
 * Fica no admin porque é da plataforma, não da unidade: a academia baixa pelo
 * painel dela, a FitMind publica aqui. O arquivo vai do navegador direto para o
 * storage por URL assinada, então dezenas de MB não passam pelo servidor.
 */

const PROGRAMAS = [
  { chave: "agente" as const, titulo: "Controlador de acesso (catraca)", dica: "controlador-acesso-fitmind.zip" },
  { chave: "conector" as const, titulo: "Conector de WhatsApp", dica: "conector-whatsapp-fitmind.zip" },
];

const emMB = (bytes: number | null) => (bytes === null ? "" : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export function PacotesDeInstalacao() {
  const obter = useServerFn(estadoDosPacotesBase);
  const preparar = useServerFn(gerarEnvioDoPacoteBase);
  const [estado, setEstado] = useState<Record<string, EstadoBase> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState<string | null>(null);

  const carregar = () => {
    setCarregando(true);
    obter({})
      .then((r) => setEstado(r as Record<string, EstadoBase>))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setCarregando(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(carregar, []);

  const enviar = async (programa: "agente" | "conector", arquivo: File) => {
    setEnviando(programa);
    try {
      const { token, caminho } = await preparar({ data: { programa } });
      const { error } = await supabase.storage
        .from("instalacao")
        .uploadToSignedUrl(caminho, token, arquivo);
      if (error) throw new Error(error.message);
      toast.success("Pacote publicado. As academias já baixam o sistema completo.");
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para enviar");
    } finally {
      setEnviando(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Package className="h-4 w-4" /> Pacotes de instalação
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Um pacote por programa, servindo <strong className="text-foreground">todas</strong> as academias.
        Traz Node, dependências, os programas de janela e os ícones — tudo que fica de fora da
        auto-atualização de propósito. Instalado, o programa se atualiza sozinho até a versão de hoje,
        então um pacote antigo continua servindo: ele é o ponto de partida, não a versão final.
      </p>

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="space-y-2">
          {PROGRAMAS.map(({ chave, titulo, dica }) => {
            const base = estado?.[chave];
            return (
              <div
                key={chave}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {base?.existe
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                    <span className="text-sm font-semibold text-foreground">{titulo}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {base?.existe
                      ? `publicado · ${emMB(base.bytes)}${
                          base.atualizado_em
                            ? ` · ${new Date(base.atualizado_em).toLocaleString("pt-BR")}`
                            : ""
                        }`
                      : `nada publicado — a academia só consegue baixar o código solto. Envie o ${dica}`}
                  </p>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted">
                  {enviando === chave
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Upload className="h-3.5 w-3.5" />}
                  {base?.existe ? "Substituir" : "Publicar"}
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    disabled={enviando !== null}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      e.target.value = "";
                      if (arquivo) void enviar(chave, arquivo);
                    }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
