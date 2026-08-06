import { Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import {
  clearPublicCart,
  removePublicCartLine,
  setPublicCartQuantity,
  type PublicCartLine,
} from "@/lib/public-store";
import { setCheckoutIntent } from "@/lib/post-auth-intent";

const fmt = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PublicCartDrawer({
  open,
  lines,
  onClose,
  onChange,
}: {
  open: boolean;
  lines: PublicCartLine[];
  onClose: () => void;
  onChange: (lines: PublicCartLine[]) => void;
}) {
  if (!open) return null;

  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm modal-safe overflow-y-auto overscroll-contain sm:items-center sm:p-4">
      <div className="flex max-h-[min(88dvh,720px)] w-full max-w-md flex-col rounded-t-2xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Seu carrinho</h2>
            <p className="text-xs text-muted-foreground">{count} {count === 1 ? "item" : "itens"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar carrinho" className="rounded-lg p-2 text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Seu carrinho está vazio.</p>
        ) : (
          <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
            {lines.map((line) => (
              <div key={line.id} className="flex items-center gap-3 rounded-xl bg-muted p-2.5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
                  {line.imageUrl ? (
                    <img src={line.imageUrl} alt={line.title} className="h-full w-full object-contain" />
                  ) : (
                    <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs font-bold text-foreground">{line.title}</p>
                  <p className="text-[11px] text-muted-foreground">{fmt(line.price * line.quantity)}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button type="button" aria-label="Diminuir quantidade" onClick={() => onChange(setPublicCartQuantity(line.id, line.quantity - 1))} className="rounded-md bg-background p-1.5">
                      <Minus className="h-3 w-3 text-foreground" />
                    </button>
                    <span className="min-w-5 text-center text-xs font-bold text-foreground">{line.quantity}</span>
                    <button type="button" aria-label="Aumentar quantidade" onClick={() => onChange(setPublicCartQuantity(line.id, line.quantity + 1))} className="rounded-md bg-background p-1.5">
                      <Plus className="h-3 w-3 text-foreground" />
                    </button>
                  </div>
                </div>
                <button type="button" aria-label="Remover item" onClick={() => onChange(removePublicCartLine(line.id))} className="rounded-lg p-2">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 shrink-0 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total estimado</span>
            <span className="text-lg font-bold text-foreground">{fmt(total)}</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Preço e disponibilidade serão confirmados no checkout.</p>
          <div className="mt-4 space-y-2">
            <Link to="/register" search={{ role: "student" }} onClick={setCheckoutIntent} className={`block rounded-xl px-4 py-3 text-center text-sm font-bold ${lines.length ? "bg-primary text-primary-foreground" : "pointer-events-none bg-muted text-muted-foreground"}`}>
              Finalizar compra
            </Link>
            <Link to="/login" onClick={setCheckoutIntent} className="block rounded-xl bg-muted px-4 py-3 text-center text-sm font-bold text-foreground">
              Já tenho conta — entrar
            </Link>
            {lines.length > 0 && (
              <button type="button" onClick={() => { clearPublicCart(); onChange([]); }} className="w-full py-2 text-center text-[11px] text-muted-foreground underline">
                Esvaziar carrinho
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}