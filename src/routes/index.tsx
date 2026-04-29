import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FitMind Club — Entrar ou cadastrar" },
      { name: "description", content: "Acesse ou crie sua conta no FitMind Club, a maior rede de saúde do Brasil." },
      { property: "og:title", content: "FitMind Club" },
      { property: "og:description", content: "Conectando corpo e mente para a sua melhor versão." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="flex w-full max-w-[430px] flex-col items-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary shadow-[0_20px_60px_-20px_var(--color-primary)]">
          <Flame className="h-10 w-10 text-primary-foreground" />
        </div>

        <h1 className="text-4xl font-black tracking-normal text-foreground">FitMind Club</h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
          Conectando corpo e mente para a sua melhor versão.
        </p>
        <p className="mt-3 text-sm font-bold uppercase tracking-[0.18em] text-primary">
          A maior rede de saúde do Brasil
        </p>

        <div className="mt-10 grid w-full gap-3">
          <Link
            to="/login"
            className="flex h-12 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Entrar
          </Link>
          <Link
            to="/register"
            className="flex h-12 items-center justify-center rounded-2xl border border-border bg-card px-5 text-sm font-bold text-foreground transition-colors hover:bg-muted"
          >
            Criar conta
          </Link>
        </div>
      </section>
    </main>
  );
}
