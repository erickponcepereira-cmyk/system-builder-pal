import { cn } from "@/lib/utils";

type ModalShellProps = {
  /** Conteúdo fixo no topo (título, fechar). */
  header?: React.ReactNode;
  /** Conteúdo fixo no rodapé (botões de ação). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** z-index do overlay (padrão 50). */
  zIndex?: number;
};

/**
 * Moldura padrão para modais escritos à mão.
 *
 * Garante em qualquer celular:
 * - respeita a safe-area do iPhone (notch e barra inferior);
 * - o corpo rola internamente, cabeçalho e rodapé ficam sempre visíveis;
 * - o cartão nunca ultrapassa a altura útil da tela, então os botões de
 *   ação continuam dentro da área de clique.
 *
 * Não fecha ao clicar fora nem com ESC (comportamento padrão do sistema).
 */
export function ModalShell({ header, footer, children, className, zIndex = 50 }: ModalShellProps) {
  return (
    <div
      className="modal-safe fixed inset-0 flex justify-center overflow-y-auto overscroll-contain bg-black/70 items-start sm:items-center"
      style={{ zIndex }}
    >
      <div
        className={cn(
          "flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-card shadow-xl",
          className,
        )}
      >
        {header ? <div className="shrink-0 border-b border-white/10 p-4">{header}</div> : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-white/10 bg-card p-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export default ModalShell;
