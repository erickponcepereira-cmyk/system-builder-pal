import { Flame } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/50 px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <Flame className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">FitChain</span>
        </div>
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} FitChain. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
