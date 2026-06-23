import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import { InstallAppButton } from "@/components/InstallAppButton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FitMind" },
      {
        name: "description",
        content:
          "Plataforma de gestão, produtividade e integração com Google Agenda para sincronização de compromissos e eventos.",
      },
      { property: "og:title", content: "FitMind" },
      {
        property: "og:description",
        content:
          "Plataforma de gestão, produtividade e integração com Google Agenda para sincronização de compromissos e eventos.",
      },
      { property: "og:url", content: "https://fitmindclub.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://fitmindclub.lovable.app/" }],
  }),
  component: Index,
});

function Index() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "#FFFFFF",
        fontFamily:
          "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Hero */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "60px 20px 40px",
        }}
      >
        <Logo
          className="mb-4 h-40 w-auto object-contain"
          alt="Logo FitMind Club"
        />
        <h1
          style={{
            margin: 0,
            fontSize: 40,
            lineHeight: 1.05,
            fontWeight: 900,
          }}
        >
          FitMind Club
        </h1>
        <p
          style={{
            margin: "18px 0 0",
            maxWidth: 460,
            fontSize: 17,
            lineHeight: 1.55,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          Conectando corpo e mente para a sua melhor versão.
        </p>
        <p
          style={{
            margin: "14px 0 0",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: "#FF4230",
          }}
        >
          A maior rede de saúde do Brasil
        </p>

        <div
          style={{
            width: "100%",
            maxWidth: 430,
            display: "grid",
            gap: 12,
            marginTop: 36,
          }}
        >
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
          <InstallAppButton />
        </div>
      </section>

      {/* Sobre */}
      <section
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "40px 20px",
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 12px" }}>
          Sobre a FitMind
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.7,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          A FitMind é uma plataforma de gestão, produtividade e desenvolvimento
          profissional que permite aos usuários organizar compromissos,
          acompanhar atividades e integrar opcionalmente sua conta Google
          Agenda para sincronização de eventos e compromissos.
        </p>
      </section>

      {/* Privacidade */}
      <section
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "20px 20px 60px",
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 12px" }}>
          Privacidade e Segurança
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.7,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          A FitMind respeita a privacidade dos usuários e utiliza dados apenas
          para fornecer as funcionalidades autorizadas. Quando o usuário
          conecta sua conta Google, o acesso é utilizado exclusivamente para
          leitura e gerenciamento de eventos da própria conta do usuário.
        </p>
        <p
          style={{
            margin: "16px 0 0",
            fontSize: 14,
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <a
            href="https://fitmindclub.lovable.app/privacidade"
            style={{ color: "#FF4230", textDecoration: "underline" }}
          >
            Política de Privacidade
          </a>
          <a
            href="https://fitmindclub.lovable.app/termos"
            style={{ color: "#FF4230", textDecoration: "underline" }}
          >
            Termos de Uso
          </a>
        </p>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "24px 20px",
          textAlign: "center",
          fontSize: 13,
          color: "rgba(255,255,255,0.7)",
        }}
      >
        <nav
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <a
            href="https://fitmindclub.lovable.app/privacidade"
            style={{ color: "#FFFFFF", textDecoration: "none" }}
          >
            Política de Privacidade
          </a>
          <span style={{ opacity: 0.4 }}>|</span>
          <a
            href="https://fitmindclub.lovable.app/termos"
            style={{ color: "#FFFFFF", textDecoration: "none" }}
          >
            Termos de Uso
          </a>
          <span style={{ opacity: 0.4 }}>|</span>
          <a
            href="mailto:erickponcepereira@outlook.com"
            style={{ color: "#FFFFFF", textDecoration: "none" }}
          >
            Contato
          </a>
        </nav>
        <p style={{ margin: "10px 0 0", fontSize: 12, opacity: 0.6 }}>
          © {new Date().getFullYear()} FitMind Club. Todos os direitos reservados.
        </p>
      </footer>
    </main>
  );
}
