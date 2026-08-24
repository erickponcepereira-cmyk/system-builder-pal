import { useState } from "react";
import { toast } from "sonner";
import { Award, Check, Copy, Loader2, Printer } from "lucide-react";

import { emitirCertificado, type Certificado } from "@/lib/course-exams";
import { getShareOrigin } from "@/lib/auth-redirects";

/**
 * Certificado do curso.
 *
 * O botão só aparece quando a conclusão está completa — mas quem decide de
 * verdade é o banco: `emitir_certificado` confere todas as aulas que contam e
 * a aprovação na prova final antes de gerar. A tela pode errar a conta; o
 * banco não deixa passar.
 *
 * Não há PDF. O certificado é uma página que imprime — e imprimir para PDF é
 * um passo que todo navegador e todo celular já fazem. Gerar PDF no servidor
 * exigiria uma dependência nova para resolver um problema que o sistema
 * operacional já resolve.
 */
export function CourseCertificateCard({
  digitalProductId,
  cursoTitulo,
  alunoNome,
  certificado,
  concluido,
  onEmitido,
}: {
  digitalProductId: string;
  cursoTitulo: string;
  alunoNome: string | null;
  certificado: Certificado | null;
  /** Todas as aulas que contam já concluídas? */
  concluido: boolean;
  onEmitido: (c: Certificado) => void;
}) {
  const [emitindo, setEmitindo] = useState(false);
  const [abrindo, setAbrindo] = useState(false);

  const emitir = async () => {
    setEmitindo(true);
    try {
      const c = await emitirCertificado(digitalProductId);
      onEmitido(c);
      toast.success("Certificado emitido!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível emitir o certificado.");
    } finally {
      setEmitindo(false);
    }
  };

  if (!certificado && !concluido) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Award className="h-4.5 w-4.5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Certificado</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Conclua todas as aulas — e a prova final, se o curso tiver uma — para liberar.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
          <Award className="h-4.5 w-4.5 text-emerald-500" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">
            {certificado ? "Seu certificado está pronto" : "Você concluiu o curso"}
          </p>
          {certificado ? (
            <p className="text-[11px] tabular-nums text-muted-foreground">
              Código {certificado.code} ·{" "}
              {certificado.issuedAt ? new Date(certificado.issuedAt).toLocaleDateString("pt-BR") : ""}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Emita seu certificado.</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!certificado ? (
          <button
            type="button"
            onClick={() => void emitir()}
            disabled={emitindo}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            {emitindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Award className="h-3.5 w-3.5" />}
            Emitir certificado
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAbrindo(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"
            >
              <Printer className="h-3.5 w-3.5" />
              Ver e imprimir
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${getShareOrigin()}/certificado/${certificado.code}`,
                );
                toast.success("Link de conferência copiado!");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs font-bold text-muted-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar link
            </button>
          </>
        )}
      </div>

      {abrindo && certificado && (
        <CertificadoImpresso
          certificado={certificado}
          cursoTitulo={cursoTitulo}
          alunoNome={alunoNome}
          onClose={() => setAbrindo(false)}
        />
      )}
    </section>
  );
}

/**
 * A folha do certificado.
 *
 * Fica dentro de um modal na tela e vira uma página inteira na impressão —
 * a regra `print:` esconde o resto do app. É o mesmo caminho que o aluno usa
 * para salvar em PDF, sem dependência nenhuma.
 */
function CertificadoImpresso({
  certificado,
  cursoTitulo,
  alunoNome,
  onClose,
}: {
  certificado: Certificado;
  cursoTitulo: string;
  alunoNome: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-safe fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-background/90 p-4 backdrop-blur-sm sm:items-center print:static print:bg-white print:p-0"
      role="presentation"
    >
      <div
        className="w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-4 print:max-w-none print:rounded-none print:border-0"
        role="dialog"
        aria-modal="true"
        aria-label="Certificado"
      >
        <div className="mb-3 flex items-center justify-between gap-3 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir / salvar PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-foreground"
          >
            Fechar
          </button>
        </div>

        {/* A folha. Cores fixas porque papel não tem tema escuro. */}
        <div className="folha-certificado rounded-xl border-4 border-double border-[#b8912f] bg-white p-8 text-center text-[#1a1a1a]">
          <Award className="mx-auto mb-3 h-10 w-10 text-[#b8912f]" />
          <p className="text-[11px] uppercase tracking-[0.3em] text-[#6b6b6b]">Certificado de conclusão</p>

          <p className="mt-6 text-xs text-[#6b6b6b]">Certificamos que</p>
          <p className="mt-1 text-2xl font-bold">{alunoNome || "—"}</p>

          <p className="mt-4 text-xs text-[#6b6b6b]">concluiu o curso</p>
          <p className="mt-1 text-lg font-semibold">{cursoTitulo}</p>

          <div className="mx-auto mt-8 max-w-sm border-t border-[#d8d8d8] pt-3">
            <p className="text-[11px] text-[#6b6b6b]">FitMind Club</p>
            <p className="mt-1 text-[10px] tabular-nums text-[#8a8a8a]">
              Emitido em{" "}
              {certificado.issuedAt ? new Date(certificado.issuedAt).toLocaleDateString("pt-BR") : "—"}
            </p>
            <p className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-[#6b6b6b]">
              <Check className="h-3 w-3" />
              Código de verificação: {certificado.code}
            </p>
            {/* O endereço vai impresso na folha: sem ele o código não serve
                para nada nas mãos de quem recebe o certificado. */}
            <p className="mt-1 font-mono text-[9px] text-[#8a8a8a]">
              Confira em {getShareOrigin()}/certificado/{certificado.code}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
