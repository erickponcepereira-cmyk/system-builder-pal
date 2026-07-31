import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CoachSelector, type CoachOption } from "@/components/auth/CoachSelector";
import { maskPhone } from "@/lib/masks";
import { completeGoogleStudentSignup, resolveGoogleAccount } from "@/lib/google-signup.functions";
import { readReferralSignup, clearReferralSignup, type ReferralSignup } from "@/lib/referral-signup";
import { takePostAuthIntent } from "@/lib/post-auth-intent";

/** Destino guardado antes do login (loja/produto) — consumido uma vez. */
function goAfterSignup(navigate: ReturnType<typeof useNavigate>) {
  const next = takePostAuthIntent();
  if (next) {
    if (next.startsWith("/student")) sessionStorage.setItem("fitmind_selected_area", "student");
    window.location.replace(next);
    return;
  }
  navigate({ to: "/portal-selector", replace: true });
}


type SearchParams = { role?: "coach" | "partner" | "professional" };

export const Route = createFileRoute("/complete-signup")({
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const r = search.role;
    return r === "coach" || r === "partner" || r === "professional" ? { role: r } : {};
  },
  head: () => ({
    meta: [
      { title: "Completar Cadastro — FitMind Club" },
      { name: "description", content: "Complete seus dados para acessar a FitMind Club." },
    ],
  }),
  component: CompleteSignupPage,
});

function CompleteSignupPage() {
  const navigate = useNavigate();
  const { role: intendedRole } = Route.useSearch();
  const [referral, setReferral] = useState<ReferralSignup | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "O" | "">("");
  const [birthdate, setBirthdate] = useState("");
  const [coach, setCoach] = useState<CoachOption | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        navigate({ to: "/login", replace: true });
        return;
      }
      try {
        const state = await resolveGoogleAccount({ data: undefined as never });
        if (state.status !== "needs_profile") {
          if (intendedRole) {
            navigate({ to: "/upgrade/$role", params: { role: intendedRole }, replace: true });
          } else {
            goAfterSignup(navigate);

          }
          return;
        }
        setEmail(state.email || "");
        setName(state.name || "");
      } catch {
        setEmail(data.session.user.email || "");
      }

      // Indicação (link /r/{code} ou loja pública) — sobrevive ao OAuth.
      const ref = readReferralSignup();
      setReferral(ref);
      if (ref.coachId) {
        setCoach({
          id: ref.coachId,
          profileId: "",
          name: ref.sponsorName || "Coach indicador",
        });
      }

      setChecking(false);
    })();
  }, [navigate, intendedRole]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Informe seu nome completo.");
    if (phone.replace(/\D/g, "").length < 10) return setError("Informe um telefone válido com DDD.");
    if (!gender) return setError("Selecione o sexo.");
    if (!birthdate) return setError("Informe a data de nascimento.");
    if (!coach) return setError("Selecione o coach indicador.");

    setSaving(true);
    try {
      await completeGoogleStudentSignup({
        data: {
          name: name.trim(),
          phone,
          gender,
          birthdate,
          coachId: coach.id,
          referredByStudentId: referral?.referredByStudentId ?? null,
          referralCode: referral?.code ?? null,
          partnerId: referral?.partnerId ?? null,
        },
      });
      clearReferralSignup();
      toast.success("Cadastro concluído! Bem-vindo à FitMind Club.");
      if (intendedRole) {
        navigate({ to: "/upgrade/$role", params: { role: intendedRole }, replace: true });
      } else {
        goAfterSignup(navigate);

      }
    } catch (err) {
      const msg = (err as Error)?.message || "Não foi possível concluir o cadastro.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#0A0A0A" }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo /></div>

        <div className="rounded-2xl p-6" style={{ backgroundColor: "#1A1A1A" }}>
          <h1 className="text-xl font-bold text-white">Completar cadastro</h1>
          <p className="mt-1 text-sm text-white/50">
            Faltam alguns dados para liberar seu painel de aluno{email ? ` (${email})` : ""}.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone / WhatsApp *</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="numeric"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Sexo *</Label>
              <div className="grid grid-cols-3 gap-2">
                {([["M", "Masculino"], ["F", "Feminino"], ["O", "Outro"]] as const).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setGender(v)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      gender === v ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="birthdate">Data de nascimento *</Label>
              <Input id="birthdate" type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
            </div>

            {referral?.coachId ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-white/80">
                Você foi indicado(a) por{" "}
                <span className="font-semibold text-white">{referral.sponsorName || "seu coach"}</span> — essa
                indicação fica registrada na sua conta.
              </div>
            ) : (
              <CoachSelector value={coach} onChange={setCoach} />
            )}

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Concluir cadastro
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
