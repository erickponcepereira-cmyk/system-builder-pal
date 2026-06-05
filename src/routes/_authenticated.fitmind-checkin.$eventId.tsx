import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, AlertCircle, CalendarDays } from "lucide-react";
import { checkInToEvent } from "@/lib/fitmind-attendance.functions";

export const Route = createFileRoute("/_authenticated/fitmind-checkin/$eventId")({
  component: FitmindCheckinPage,
});

function FitmindCheckinPage() {
  const { eventId } = Route.useParams();
  const checkIn = useServerFn(checkInToEvent);
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await checkIn({ data: { eventId } });
        setMessage(res.eventTitle || "");
        setState("ok");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Erro ao registrar presença.");
        setState("error");
      }
    })();
  }, [eventId, checkIn]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#0a0a0a" }}>
      <div className="w-full max-w-md rounded-2xl p-8 text-center" style={{ backgroundColor: "#111" }}>
        {state === "loading" && (
          <>
            <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" />
            <p className="mt-4 text-sm text-white/70">Registrando sua presença...</p>
          </>
        )}
        {state === "ok" && (
          <>
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <h1 className="mt-4 text-lg font-bold text-white">Presença confirmada!</h1>
            {message && <p className="mt-1 text-sm text-white/60">{message}</p>}
            <div className="mt-6 flex gap-2 justify-center">
              <Link
                to="/calendar"
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:opacity-90 inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" /> Ver agenda
              </Link>
              <button
                onClick={() => navigate({ to: "/" })}
                className="rounded-xl bg-white/5 px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/10">
                Início
              </button>
            </div>
          </>
        )}
        {state === "error" && (
          <>
            <div className="mx-auto h-14 w-14 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <h1 className="mt-4 text-lg font-bold text-white">Não foi possível registrar</h1>
            <p className="mt-1 text-sm text-white/60">{message}</p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-6 rounded-xl bg-white/5 px-4 py-2 text-xs font-bold text-white/70 hover:bg-white/10">
              Voltar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
