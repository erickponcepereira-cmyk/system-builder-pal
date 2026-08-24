import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Award, Loader2, ShieldCheck, ShieldX } from "lucide-react";

import { verificarCertificado, type CertificadoVerificado } from "@/lib/course-exams";

/**
 * Conferência pública de certificado.
 *
 * Fora de `_authenticated` de propósito: quem confere é um terceiro — uma
 * academia, um empregador — que não tem conta no FitMind. Certificado que só o
 * dono consegue abrir não prova nada a ninguém.
 *
 * O código é a autorização. A RPC devolve nome, curso e data, e nada além
 * disso: sem e-mail, sem CPF, sem telefone, sem id. E não aceita busca
 * parcial, então não dá para varrer a base tentando códigos parecidos.
 */
export const Route = createFileRoute("/certificado/$code")({
  component: VerificarCertificado,
});

function VerificarCertificado() {
  const { code } = Route.useParams();
  const [dados, setDados] = useState<CertificadoVerificado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await verificarCertificado(code);
        if (vivo) setDados(r);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível conferir agora.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [code]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-5">
      <header className="text-center">
        <Award className="mx-auto mb-2 h-8 w-8 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Conferência de certificado</h1>
        <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">{code}</p>
      </header>

      {carregando ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : erro ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-center">
          <p className="text-sm text-destructive">{erro}</p>
        </div>
      ) : dados ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <p className="flex items-center justify-center gap-2 text-sm font-bold text-emerald-500">
            <ShieldCheck className="h-4 w-4" />
            Certificado válido
          </p>

          <dl className="mt-4 flex flex-col gap-3 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Aluno</dt>
              <dd className="text-base font-bold text-foreground">{dados.aluno}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Curso</dt>
              <dd className="text-sm font-semibold text-foreground">{dados.curso}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Emitido em</dt>
              <dd className="text-sm tabular-nums text-foreground">
                {dados.emitidoEm ? new Date(dados.emitidoEm).toLocaleDateString("pt-BR") : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-bold text-amber-500">
            <ShieldX className="h-4 w-4" />
            Código não encontrado
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-500/80">
            Confira se digitou exatamente como está no certificado. Nenhum certificado do FitMind
            Club corresponde a este código.
          </p>
        </div>
      )}

      <p className="text-center text-[10px] text-muted-foreground">FitMind Club</p>
    </div>
  );
}
