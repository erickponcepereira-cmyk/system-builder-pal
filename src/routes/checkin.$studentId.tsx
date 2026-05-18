import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkin/$studentId")({
  head: () => ({
    meta: [
      { title: "Check-in via QR — FitMind Club" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckinPage,
});

function CheckinPage() {
  const { studentId } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "needs_login" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("");
  const [studentName, setStudentName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setState("needs_login");
        return;
      }
      const { data, error } = await supabase.rpc("register_checkin_via_qr", {
        _student_id: studentId,
        _location: null,
        _notes: null,
      } as never);
      if (error) {
        setState("error");
        setMessage(error.message || "Não foi possível registrar o check-in.");
        return;
      }
      const payload = (data as { student_name?: string } | null) ?? {};
      setStudentName(payload.student_name || "");
      setState("success");
    })();
  }, [studentId]);

  return (
    <div className="min-h-screen bg-background p-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-white">Check-in FitMind</h1>
        </div>

        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-white/70">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Registrando presença…</p>
          </div>
        )}

        {state === "needs_login" && (
          <div className="space-y-4">
            <p className="text-sm text-white/80">
              Você precisa estar logado como coach ou admin para registrar o check-in deste aluno.
            </p>
            <button
              onClick={() => navigate({ to: "/login", search: { redirect: `/checkin/${studentId}` } as never })}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
            >
              Entrar
            </button>
          </div>
        )}

        {state === "success" && (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <h2 className="text-lg font-bold text-white">Presença confirmada!</h2>
            {studentName && <p className="text-sm text-white/70">Aluno: <span className="font-semibold text-white">{studentName}</span></p>}
            <p className="text-xs text-white/40">Check-in registrado em {new Date().toLocaleString("pt-BR")}</p>
            <Link to="/" className="mt-2 inline-block rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white">
              Voltar
            </Link>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-3 text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-400" />
            <h2 className="text-lg font-bold text-white">Não foi possível registrar</h2>
            <p className="text-sm text-white/70">{message}</p>
            <Link to="/" className="mt-2 inline-block rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white">
              Voltar
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
