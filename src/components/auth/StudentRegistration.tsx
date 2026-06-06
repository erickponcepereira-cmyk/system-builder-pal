import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Eye, EyeOff, UserCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CoachSelector, type CoachOption } from "@/components/auth/CoachSelector";
import { finalizeRegistrationFn } from "@/lib/registration.functions";
import { translateAuthError } from "@/lib/auth-errors";
import { maskPhone } from "@/lib/masks";
import { createAuthUser } from "@/components/auth/createAuthUser";
import { CheckEmailNotice } from "@/components/auth/CheckEmailNotice";

// ============================================================
// STUDENT REGISTRATION (simpler)
// ============================================================
type ReferralContext = {
  code: string;
  kind: "coach" | "student" | "partner";
  sponsorName: string;
  coachId: string | null;
  referredByStudentId: string | null;
  partnerId?: string | null;
};

export function StudentRegistration({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "O" | "">("");
  const [instagram, setInstagram] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<CoachOption | null>(null);
  const [referral, setReferral] = useState<ReferralContext | null>(null);
  const [referralCoachName, setReferralCoachName] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("fitmind_referral");
      if (!raw) return;
      const parsed = JSON.parse(raw) as ReferralContext;
      if (!parsed?.code) return;
      setReferral(parsed);
      if (parsed.coachId) {
        setSelectedCoach({ id: parsed.coachId, profileId: "", name: parsed.sponsorName, referralCode: parsed.code } as unknown as CoachOption);
        if (parsed.kind === "coach") {
          setReferralCoachName(parsed.sponsorName);
        } else {
          // Sponsor é aluno (padrinho) ou parceiro (empresa): buscar nome do coach vinculado
          (async () => {
            const { data } = await supabase
              .from("coaches")
              .select("profiles!coaches_profile_id_fkey(name)")
              .eq("id", parsed.coachId!)
              .maybeSingle();
              const coachName = (data as unknown as { profiles?: { name?: string | null } } | null)?.profiles?.name || "Coach vinculado";
            setReferralCoachName(coachName);
          })();
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const setErr = (m: string) => { setFormError(m); toast.error(m); };
    if (!name.trim()) return setErr("Informe seu nome completo.");
    if (!email.includes("@") || !email.includes(".")) return setErr("E-mail inválido. Use o formato nome@dominio.com.");
    if (phone.replace(/\D/g, "").length < 10) return setErr("WhatsApp incompleto. Inclua DDD + número.");
    if (!gender) return setErr("Selecione seu gênero para continuar.");
    const pwdChecks = {
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    };
    if (!Object.values(pwdChecks).every(Boolean)) {
      return setErr("A senha deve conter no mínimo 8 caracteres, 1 letra maiúscula, 1 minúscula, 1 número e 1 caractere especial.");
    }
    const coachIdToUse = referral?.coachId || selectedCoach?.id;
    if (!coachIdToUse) return setErr("Selecione seu coach para continuar.");
    if (!acceptTerms) return setErr("Aceite os Termos de Uso, Termos de Compra e Política de Privacidade para continuar.");

    setLoading(true);
    setFormError(null);
    try {
      const user = await createAuthUser(email, password, name, "student");

      await finalizeRegistrationFn({
        data: {
          userId: user.id,
          role: "student",
          name,
          email,
          phone,
          gender,
          instagram: instagram.trim() || null,
          student: {
            coachId: coachIdToUse,
            referredByStudentId: referral?.referredByStudentId || null,
            referralCode: referral?.code || null,
            partnerId: referral?.partnerId || null,
          },
        },
      });

      sessionStorage.removeItem("fitmind_referral");
      sessionStorage.removeItem("fitmind_selected_area");
      await supabase.auth.signOut().catch(() => {});
      setRegisteredEmail(email.trim().toLowerCase());
      toast.success(
        referral
          ? `Cadastro criado! Confira seu e-mail para confirmar a conta. Você foi vinculado(a) a ${referral.sponsorName}.`
          : "Cadastro criado! Confira seu e-mail para confirmar a conta."
      );
    } catch (error) {
      const friendly = translateAuthError(error);
      setFormError(friendly);
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  if (registeredEmail) {
    return <CheckEmailNotice email={registeredEmail} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <Logo className="h-10 w-10 object-contain" />
            <span className="text-lg font-bold text-white">FitMind Club</span>
          </div>
          <h1 className="text-xl font-bold text-white">Cadastro de Aluno</h1>
        </div>

        <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A" }}>
          {referral && (
            <div className="mb-4 rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs text-white/80">
              <p className="font-semibold text-primary">
                {referral.kind === "partner" ? "Convite de colaborador" : "Convite válido"}
              </p>
              <p className="mt-1">
                {referral.kind === "partner" ? (
                  <>Você foi convidado(a) como colaborador(a) de <span className="font-semibold text-white">{referral.sponsorName}</span>. Você terá acesso ao painel de aluno com todos os benefícios.</>
                ) : (
                  <>Você foi indicado(a) por <span className="font-semibold text-white">{referral.sponsorName}</span>{referral.kind === "student" ? " (padrinho)" : " (coach)"}. Seu coach já está vinculado automaticamente.</>
                )}
              </p>
            </div>
          )}
          {formError && (
            <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {formError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white/70">Nome completo</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">WhatsApp</Label>
              <Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Gênero</Label>
              <div className="grid grid-cols-3 gap-2">
                {([["M","Masculino"],["F","Feminino"],["O","Outro"]] as const).map(([v,label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setGender(v)}
                    className={`rounded-xl py-2 text-sm font-semibold transition-colors ${gender === v ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Instagram <span className="text-white/30 text-xs">(opcional)</span></Label>
              <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@seuusuario" maxLength={100} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
            </div>
            {referral ? (
              <div className="space-y-2">
                <Label className="text-white/70">Coach indicador</Label>
                <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-white">
                      {referralCoachName || "Carregando coach..."}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-primary/80 font-bold">Vinculado</span>
                </div>
                <p className="text-[11px] text-white/40">
                  Coach definido automaticamente pela sua indicação e não pode ser alterado.
                </p>
              </div>
            ) : (
              <CoachSelector value={selectedCoach} onChange={setSelectedCoach} />
            )}

            <div className="space-y-2">
              <Label className="text-white/70">Senha</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 pr-10"
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <label className="flex items-start gap-2 cursor-pointer pt-1">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-1" />
              <span className="text-xs text-white/60">
                Li e aceito os <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Termos de Uso</a>,{" "}
                os <a href="/termos-compra" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Termos de Compra</a> e a{" "}
                <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Política de Privacidade</a>.
              </span>
            </label>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onBack} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Criar conta"}
              </Button>
            </div>
          </form>
        </div>

        <div className="mt-4 text-center text-sm text-white/40">
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </div>
      </div>
    </div>
  );
}
