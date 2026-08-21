import { MAINTENANCE_ETA } from "@/lib/maintenance";
import { Logo } from "@/components/Logo";

export function MaintenanceScreen() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        fontFamily:
          "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        <Logo className="mx-auto mb-6 h-28 w-auto object-contain" alt="Logo FitMind Club" />
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: "#FF4230",
          }}
        >
          FitMind Club
        </p>
        <h1 style={{ margin: "12px 0 0", fontSize: 30, fontWeight: 900, lineHeight: 1.15 }}>
          Sistema em manutenção
        </h1>
        <p
          style={{
            margin: "16px 0 0",
            fontSize: 16,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.75)",
          }}
        >
          Estamos realizando uma manutenção para melhorar a sua experiência.
          O acesso volta automaticamente assim que terminarmos.
        </p>
        <div
          style={{
            marginTop: 24,
            borderRadius: 18,
            border: "1px solid rgba(255, 66, 48, 0.35)",
            background: "#141414",
            padding: "16px 18px",
          }}
        >
          <p style={{ margin: 0, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>
            Horário previsto para retorno
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 900, color: "#FF4230" }}>
            {MAINTENANCE_ETA}
          </p>
        </div>
        <p style={{ margin: "22px 0 0", fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
          Obrigado pela paciência. Em caso de urgência:{" "}
          <a href="mailto:erickponcepereira@outlook.com" style={{ color: "#FF4230" }}>
            contato
          </a>
          .
        </p>
      </div>
    </main>
  );
}
