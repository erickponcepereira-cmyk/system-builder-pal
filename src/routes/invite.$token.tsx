import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, MapPin, User as UserIcon, Check, ExternalLink } from "lucide-react";

type Invite = {
  id: string;
  summary: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  attendee_confirmed: boolean;
  html_link: string | null;
};

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
  head: () => ({
    meta: [
      { title: "Convite — FitMindClub" },
      { name: "description", content: "Confirme sua presença e adicione o evento ao seu Google Agenda." },
    ],
  }),
});

function fmtGoogleDate(iso: string) {
  // YYYYMMDDTHHmmssZ
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildGoogleTemplate(inv: Invite) {
  const start = fmtGoogleDate(inv.start_at);
  const end = fmtGoogleDate(inv.end_at ?? new Date(new Date(inv.start_at).getTime() + 60 * 60 * 1000).toISOString());
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: inv.summary,
    dates: `${start}/${end}`,
    details: inv.description ?? "Agendado via FitMindClub",
  });
  if (inv.location) params.set("location", inv.location);
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

function InvitePage() {
  const { token } = Route.useParams();
  const [inv, setInv] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/invite/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Erro");
        return r.json();
      })
      .then((d) => setInv(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/public/invite/${token}`, { method: "POST" });
      if (!r.ok) throw new Error("Falha ao confirmar");
      setInv((prev) => (prev ? { ...prev, attendee_confirmed: true } : prev));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Carregando…</div>;
  }
  if (error || !inv) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Convite indisponível</h1>
          <p className="text-muted-foreground">{error ?? "Não encontrado."}</p>
        </div>
      </div>
    );
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl">
        <div className="flex items-center gap-2 text-primary mb-3">
          <Calendar className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-wider">Convite FitMindClub</span>
        </div>
        <h1 className="text-2xl font-bold mb-2">{inv.summary}</h1>
        <p className="text-sm text-muted-foreground mb-4 capitalize">{fmt(inv.start_at)}</p>

        {inv.location && (
          <p className="flex items-center gap-2 text-sm mb-2">
            <MapPin className="h-4 w-4 text-primary" /> {inv.location}
          </p>
        )}
        {inv.attendee_name && (
          <p className="flex items-center gap-2 text-sm mb-2">
            <UserIcon className="h-4 w-4 text-primary" /> {inv.attendee_name}
          </p>
        )}
        {inv.description && (
          <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{inv.description}</p>
        )}

        <div className="mt-6 space-y-3">
          <button
            onClick={confirm}
            disabled={busy || inv.attendee_confirmed}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {inv.attendee_confirmed ? "Presença confirmada" : busy ? "Confirmando…" : "Confirmar presença"}
          </button>
          <a
            href={buildGoogleTemplate(inv)}
            target="_blank"
            rel="noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border py-3 font-semibold hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" /> Adicionar ao Google Agenda
          </a>
        </div>
      </div>
    </div>
  );
}
