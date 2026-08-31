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
import { clearPostAuthIntent, peekPostAuthIntent } from "@/lib/post-auth-intent";
import { lerToqueId, resolverCodigo, resolverToque } from "@/lib/atribuicao";
import { recordTermsAcceptance } from "@/lib/terms-acceptance.functions";
import { CURATION_DOC, TERMS_PDF_URL, TERMS_VERSION } from "@/lib/terms";
import { UFS } from "@/lib/compliance-gate";

/** Destino guardado antes do login (loja/produto) — consumido uma vez. */
function goAfterSignup(navigate: ReturnType<typeof useNavigate>) {
  const next = peekPostAuthIntent();
  if (next) {
    if (next.startsWith("/student")) sessionStorage.setItem("fitmind_selected_area", "student");
    clearPostAuthIntent();
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
  const [touchId, setTouchId] = useState<string | null>(null);

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "O" | "">("");
  const [birthdate, setBirthdate] = useState("");
  const [coach, setCoach] = useState<CoachOption | null>(null);
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
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
        // Apple não devolve o nome: não deixe o e-mail virar nome do perfil.
        const nomeVindo = (state.name || "").trim();
        setName(nomeVindo.includes("@") ? "" : nomeVindo);

      } catch {
        setEmail(data.session.user.email || "");
      }

      // Indicação (link /r/{code} ou loja pública) — sobrevive ao OAuth.
      let ref = readReferralSignup();
      // Link `?ref=` grava só o código: resolve aqui quem é o coach, senão o
      // seletor aparece vazio e a indicação se perde.
      if (ref.code) {
        const row = await resolverCodigo(ref.code);
        if (row) {
          ref = {
            ...ref,
            coachId: row.coach_id,
            sponsorName: row.sponsor_name,
            partnerId: row.partner_id ?? ref.partnerId,
            referredByStudentId: row.referred_by_student_id ?? ref.referredByStudentId,
          };
        } else {
          ref = {
            code: null,
            kind: null,
            coachId: null,
            sponsorName: null,
            partnerId: null,
            referredByStudentId: null,
          };
          setError("O link de indicação expirou. Selecione um coach para continuar.");
        }
      }

      // Sem indicação no navegador (storage perdido no OAuth): usa o toque
      // registrado no servidor quando a pessoa abriu o link.
      const toque = lerToqueId();
      setTouchId(toque);
      if (!ref.coachId && toque) {
        const t = await resolverToque(toque);
        if (t?.coachId && !t.claimedProfileId) {
          ref = {
            code: t.code || ref.code,
            kind: ref.kind ?? null,
            coachId: t.coachId,
            sponsorName: t.sponsorName,
            partnerId: t.partnerId ?? ref.partnerId,
            referredByStudentId: t.referredByStudentId ?? ref.referredByStudentId,
          };
          setError(null);
        }
      }

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
    if (name.trim().length < 2 || name.includes("@")) return setError("Informe seu nome completo (não use o e-mail).");
    if (name.trim().split(/\s+/).length < 2) return setError("Informe nome e sobrenome.");
    if (phone.replace(/\D/g, "").length < 10) return setError("Informe um telefone válido com DDD.");
    if (!gender) return setError("Selecione o sexo.");
    if (!birthdate) return setError("Informe a data de nascimento.");
    if (!coach) return setError("Selecione o coach indicador.");
    if (city.trim().length < 2 || uf.length !== 2) return setError("Informe sua cidade e o estado.");
    if (!acceptTerms) return setError("Aceite o Termo de Adesão e a Política de Privacidade para continuar.");

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
          touchId: touchId,
        },
      });

      // Cidade e aceite: o cadastro por Google/Apple não registrava nenhum dos
      // dois. Vão depois do cadastro porque dependem do perfil já criado.
      try {
        const { data: sess } = await supabase.auth.getUser();
        if (sess.user) {
          await supabase
            .from("profiles")
            .update({ city: city.trim(), state: uf })
            .eq("user_id", sess.user.id);
        }
      } catch (cityErr) {
        // Não derruba o cadastro: o ComplianceGate cobra a cidade no próximo acesso.
        console.error("[complete-signup] cidade", cityErr);
      }

      try {
        await recordTermsAcceptance({
          data: {
            termType: "aluno",
            termVersion: TERMS_VERSION.aluno,
            context: { origin: "complete_signup_oauth", curation_doc: CURATION_DOC.url },
          },
        });
      } catch (termsErr) {
        // Idem: o gate cobra o aceite na entrada seguinte em vez de perder o cadastro.
        console.error("[complete-signup] aceite", termsErr);
      }

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

            {/* Cidade: sem ela a loja e os gratuitos por localização não funcionam. */}
            <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="city">Cidade *</Label>
                <Input id="city" value={city} autoComplete="address-level2" onChange={(e) => setCity(e.target.value)} placeholder="Sua cidade" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="uf">UF *</Label>
                <select
                  id="uf"
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                >
                  <option value="">--</option>
                  {UFS.map((sigla) => <option key={sigla} value={sigla}>{sigla}</option>)}
                </select>
              </div>
            </div>

            {referral?.coachId ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-white/80">
                Você foi indicado(a) por{" "}
                <span className="font-semibold text-white">{referral.sponsorName || "seu coach"}</span> — essa
                indicação fica registrada na sua conta e não pode ser alterada.
              </div>
            ) : (
              <CoachSelector value={coach} onChange={setCoach} />
            )}

            {/* Aceite: o cadastro por Google/Apple entrava sem registrar nada. */}
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1 shrink-0"
              />
              <span className="text-[11px] leading-relaxed text-white/70">
                Li e aceito o{" "}
                <a href={TERMS_PDF_URL.aluno} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Termo de Adesão FitMind — Aluno</a>,{" "}
                os <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Termos de Uso</a>,{" "}
                os <a href="/termos-compra" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Termos de Compra</a>,{" "}
                a <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Política de Privacidade</a>{" "}
                e os <a href={CURATION_DOC.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{CURATION_DOC.title}</a>.
              </span>
            </label>

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
