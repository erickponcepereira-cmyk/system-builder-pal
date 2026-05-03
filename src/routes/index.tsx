import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

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
    <main
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#050505",
        color: "#FFFFFF",
        padding: "40px 20px",
        fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 430,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <img
          src={fitmindLogo}
          alt="Logo FitMind Club"
          style={{
            width: 156,
            height: 156,
            objectFit: "contain",
            filter: "drop-shadow(0 24px 70px rgba(255, 66, 48, 0.28))",
            marginBottom: 18,
          }}
        />

        <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1.05, fontWeight: 900, letterSpacing: 0 }}>
          FitMind Club
        </h1>
        <p style={{ margin: "18px 0 0", maxWidth: 360, fontSize: 17, lineHeight: 1.55, color: "rgba(255,255,255,0.72)" }}>
          Conectando corpo e mente para a sua melhor versão.
        </p>
        <p style={{ margin: "14px 0 0", fontSize: 12, fontWeight: 800, letterSpacing: 2.2, textTransform: "uppercase", color: "#FF4230" }}>
          A maior rede de saúde do Brasil
        </p>

        <div style={{ width: "100%", display: "grid", gap: 12, marginTop: 42 }}>
          <Link
            to="/login"
            style={{
              height: 52,
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#FF4230",
              color: "#FFFFFF",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            Entrar
          </Link>
          <Link
            to="/register"
            style={{
              height: 52,
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#141414",
              border: "1px solid rgba(255, 66, 48, 0.35)",
              color: "#FFFFFF",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            Criar conta
          </Link>
        </div>
      </section>
    </main>
  );
}
