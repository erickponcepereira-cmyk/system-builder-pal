import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Flame, Menu, X } from "lucide-react";
import { useState } from "react";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Flame className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground">FitMind Club</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Início
          </Link>
          <Link to="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Entrar
          </Link>
          <Button asChild size="sm">
            <Link to="/register">Cadastre-se</Link>
          </Button>
        </nav>

        <button
          className="md:hidden text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            <Link to="/" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>
              Início
            </Link>
            <Link to="/login" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>
              Entrar
            </Link>
            <Button asChild size="sm">
              <Link to="/register" onClick={() => setMobileOpen(false)}>Cadastre-se</Link>
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
