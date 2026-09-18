import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Z_MODAL_DA_LOJA } from "@/hooks/use-fechar-com-escape";

/** O que a janela pergunta. */
export type Pergunta = {
  titulo: string;
  descricao: string;
  /** Texto do botão que confirma — "Ocultar", não "OK". */
  acao: string;
};

type Pendente = Pergunta & { responder: (sim: boolean) => void };

const ConfirmarContext = createContext<((pergunta: Pergunta) => Promise<boolean>) | null>(null);

/**
 * Pergunta sim/não numa janela do app e espera a resposta.
 *
 * Existe para não usar `window.confirm`, que abre a caixa do navegador: fora
 * do visual do app, com o endereço do site no título, e diferente em cada
 * celular.
 */
export function useConfirmar() {
  const confirmar = useContext(ConfirmarContext);
  if (!confirmar) throw new Error("useConfirmar precisa do <ConfirmProvider>");
  return confirmar;
}

/** Acima dos modais da loja, porque a pergunta costuma sair de dentro deles. */
const Z_CONFIRMACAO = Z_MODAL_DA_LOJA + 10;

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pendente, setPendente] = useState<Pendente | null>(null);

  const confirmar = useCallback(
    (pergunta: Pergunta) =>
      new Promise<boolean>((resolve) => {
        setPendente((anterior) => {
          // Pergunta nova com outra aberta: a antiga recebe "não", em vez de
          // deixar quem esperava por ela pendurado para sempre.
          anterior?.responder(false);
          return { ...pergunta, responder: resolve };
        });
      }),
    [],
  );

  const responder = (sim: boolean) => {
    pendente?.responder(sim);
    setPendente(null);
  };

  return (
    <ConfirmarContext.Provider value={confirmar}>
      {children}
      <AlertDialog.Root
        open={pendente !== null}
        onOpenChange={(aberta) => {
          if (!aberta) responder(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            style={{ zIndex: Z_CONFIRMACAO }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
          />
          <AlertDialog.Content
            style={{ zIndex: Z_CONFIRMACAO }}
            // O Escape fecha só a pergunta. Sem isto ele segue até a window,
            // onde o modal de baixo também escuta, e fecha os dois.
            onEscapeKeyDown={(e) => e.stopPropagation()}
            className="fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-xl"
          >
            <AlertDialog.Title className="text-base font-bold leading-snug text-foreground">
              {pendente?.titulo}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {pendente?.descricao}
            </AlertDialog.Description>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <AlertDialog.Cancel className="rounded-xl border border-border px-4 py-3 text-sm font-bold text-foreground">
                Cancelar
              </AlertDialog.Cancel>
              <AlertDialog.Action
                onClick={() => responder(true)}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
              >
                {pendente?.acao}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmarContext.Provider>
  );
}
