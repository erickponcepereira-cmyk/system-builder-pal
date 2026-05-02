import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, User, Dumbbell, Loader2, Eye, EyeOff, Check, Upload, UserCheck } from "lucide-react";
import fitmindLogo from "@/assets/fitmind-logo.png";
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CoachSelector, type CoachOption } from "@/components/auth/CoachSelector";
import { finalizeRegistrationFn } from "@/server/registration.functions";
import { translateAuthError } from "@/lib/auth-errors";

type SearchParams = { role?: string };

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Cadastro — FitMind Club" },
      { name: "description", content: "Cadastre-se como coach ou aluno na plataforma FitMind Club." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    role: search.role as string | undefined,
  }),
  component: RegisterPage,
});

// CPF mask
function maskCPF(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// Phone mask
function maskPhone(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

// CEP mask
function maskCEP(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function createAuthUser(email: string, password: string, name: string, role: "coach" | "student") {
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { name: name.trim(), role },
      emailRedirectTo: `${window.location.origin}/login`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      throw new Error("Este e-mail já está cadastrado. Faça login ou use 'Esqueci minha senha'.");
    }
    throw new Error(error.message || "Não foi possível criar a conta de acesso.");
  }

  if (!data.user) {
    throw new Error("Não foi possível criar a conta. Tente novamente em instantes.");
  }

  // Quando o e-mail já existe e a confirmação está ativa, o Supabase devolve
  // um usuário "mascarado" (identities vazio) por segurança. Não logamos —
  // avisamos para o usuário usar a opção de login/recuperação.
  if (data.user.identities && data.user.identities.length === 0) {
    throw new Error("Este e-mail já está cadastrado. Faça login ou use 'Esqueci minha senha'.");
  }

  return data.user;
}

function RegisterPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [role, setRole] = useState<"student" | "coach" | null>(
    search.role === "coach" ? "coach" : search.role === "student" ? "student" : null
  );

  // If coach, show multi-step. If student, simpler form.
  if (role === "coach") {
    return <CoachRegistration onBack={() => setRole(null)} />;
  }

  if (role === "student") {
    return <StudentRegistration onBack={() => setRole(null)} />;
  }

  // Role selection
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <img src={fitmindLogo} alt="Logo FitMind Club" className="h-12 w-12 object-contain" />
            <span className="text-2xl font-bold text-white">FitMind Club</span>
          </Link>
          <h1 className="text-2xl font-bold text-white">Criar conta</h1>
          <p className="mt-1 text-sm text-white/50">Escolha seu perfil para começar</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => setRole("student")}
            className="group w-full rounded-2xl border border-white/10 p-6 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
            style={{ backgroundColor: "#1A1A1A" }}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <User className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Sou Aluno</h3>
                <p className="text-sm text-white/50">Quero participar de desafios fitness</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setRole("coach")}
            className="group w-full rounded-2xl border border-white/10 p-6 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
            style={{ backgroundColor: "#1A1A1A" }}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Dumbbell className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Sou Coach</h3>
                <p className="text-sm text-white/50">Quero vender desafios e montar minha rede</p>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-white/40">
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </div>

        <div className="mt-4 text-center">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-white/30 hover:text-white/60">
            <ArrowLeft className="h-4 w-4" /> Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COACH MULTI-STEP REGISTRATION
// ============================================================
function CoachRegistration({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const clearError = () => { if (formError) setFormError(null); };

  // Step 1
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 2
  const [bio, setBio] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  // Step 3
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<CoachOption | null>(null);

  const fetchCep = useCallback(async (cepValue: string) => {
    const clean = cepValue.replace(/\D/g, "");
    if (clean.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setStreet(data.logradouro || "");
          setNeighborhood(data.bairro || "");
          setCity(data.localidade || "");
          setState(data.uf || "");
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const fail = (msg: string) => {
    setFormError(msg);
    toast.error(msg);
    return false;
  };

  const validateStep1 = () => {
    if (!name || !cpf || !email || !phone || !birthdate || !password || !confirmPassword)
      return fail("Preencha todos os campos obrigatórios desta etapa.");
    if (!email.includes("@") || !email.includes("."))
      return fail("E-mail inválido. Use o formato nome@dominio.com.");
    if (cpf.replace(/\D/g, "").length !== 11)
      return fail("CPF incompleto. Digite os 11 dígitos.");
    if (phone.replace(/\D/g, "").length < 10)
      return fail("WhatsApp incompleto. Inclua DDD + número.");
    if (password.length < 8)
      return fail("A senha deve ter no mínimo 8 caracteres.");
    if (!/[A-Z]/.test(password))
      return fail("A senha deve ter pelo menos 1 letra maiúscula.");
    if (!/[0-9]/.test(password))
      return fail("A senha deve ter pelo menos 1 número.");
    if (password !== confirmPassword)
      return fail("As senhas não coincidem. Confira a confirmação.");
    setFormError(null);
    return true;
  };

  const validateStep2 = () => {
    if (!cep || cep.replace(/\D/g, "").length !== 8)
      return fail("Informe um CEP válido (8 dígitos).");
    if (!number) return fail("Informe o número do endereço.");
    setFormError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!acceptTerms) {
      const m = "Aceite os Termos de Uso para continuar.";
      setFormError(m); toast.error(m);
      return;
    }
    if (!selectedCoach) {
      const m = "Selecione o coach que te indicou.";
      setFormError(m); toast.error(m);
      return;
    }

    setLoading(true);
    setFormError(null);
    try {
      const referralCode = generateReferralCode();
      const user = await createAuthUser(email, password, name, "coach");

      await finalizeRegistrationFn({
        data: {
          userId: user.id,
          role: "coach",
          name,
          email,
          phone,
          cpf,
          birthdate,
          bio,
          street,
          number,
          neighborhood,
          city,
          state,
          zipCode: cep,
          coach: {
            uplineCoachId: selectedCoach.id,
            referralCode,
            referralLink: `${window.location.origin}/r/${referralCode}`,
          },
        },
      });

      // Sai da sessão local (caso exista) — usuário precisa confirmar e-mail antes de entrar.
      await supabase.auth.signOut().catch(() => {});
      sessionStorage.removeItem("fitmind_selected_area");
      setRegisteredEmail(email.trim().toLowerCase());
      toast.success("Cadastro criado! Confira seu e-mail para confirmar a conta.");
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
    <div className="flex min-h-screen items-center justify-center px-4 py-8" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <img src={fitmindLogo} alt="Logo FitMind Club" className="h-10 w-10 object-contain" />
            <span className="text-lg font-bold text-white">FitMind Club</span>
          </div>
          <h1 className="text-xl font-bold text-white">Cadastro de Coach</h1>
        </div>

        {/* Progress bar */}
        <div className="mb-6 flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  s <= step ? "bg-primary" : "bg-white/10"
                }`}
              />
              <p className="mt-1 text-[10px] text-white/40 text-center">
                {s === 1 ? "Dados Pessoais" : s === 2 ? "Endereço" : "Indicação"}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A" }}>
          {formError && (
            <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {formError}
            </div>
          )}
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-white/70">Nome completo *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome completo" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">CPF *</Label>
                <Input value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">E-mail *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">WhatsApp *</Label>
                <Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Data de nascimento *</Label>
                <Input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Senha *</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mín. 8 chars, 1 maiúscula, 1 número"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 pr-10"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Confirmar senha *</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a senha" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={onBack} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button onClick={() => { if (validateStep1()) { setFormError(null); setStep(2); } }} className="flex-1">
                  Próximo <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-white/70">Bio / Apresentação</Label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 300))}
                  placeholder="Conte um pouco sobre você..."
                  maxLength={300}
                  rows={3}
                  className="flex w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="text-[10px] text-white/30 text-right">{bio.length}/300</p>
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">CEP *</Label>
                <Input
                  value={cep}
                  onChange={(e) => {
                    const masked = maskCEP(e.target.value);
                    setCep(masked);
                    fetchCep(masked);
                  }}
                  placeholder="00000-000"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Rua</Label>
                <Input value={street} onChange={(e) => setStreet(e.target.value)} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white/70">Número *</Label>
                  <Input value={number} onChange={(e) => setNumber(e.target.value)} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70">Complemento</Label>
                  <Input value={complement} onChange={(e) => setComplement(e.target.value)} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Bairro</Label>
                <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white/70">Cidade</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70">Estado</Label>
                  <Input value={state} onChange={(e) => setState(e.target.value)} maxLength={2} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => { setFormError(null); setStep(1); }} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button onClick={() => { if (validateStep2()) { setFormError(null); setStep(3); } }} className="flex-1">
                  Próximo <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <CoachSelector value={selectedCoach} onChange={setSelectedCoach} />

              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                Os dados bancários (chave PIX e conta) serão solicitados apenas no momento do seu primeiro saque, na aba <span className="text-white">Carteira</span>. Eles ficam salvos para futuros pagamentos.
              </div>

              <label className="flex items-start gap-3 pt-2 cursor-pointer">
                <div
                  onClick={() => setAcceptTerms(!acceptTerms)}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    acceptTerms ? "bg-primary border-primary" : "border-white/20 bg-white/5"
                  }`}
                >
                  {acceptTerms && <Check className="h-3 w-3 text-white" />}
                </div>
                <span className="text-xs text-white/50">
                  Li e aceito os <button type="button" className="text-primary hover:underline">Termos de Uso</button> e a{" "}
                  <button type="button" className="text-primary hover:underline">Política de Privacidade</button> da FitMind Club.
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => { setFormError(null); setStep(2); }} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button onClick={handleSubmit} className="flex-1" disabled={loading}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Criar conta"}
                </Button>
              </div>

              <p className="mt-2 text-xs text-white/30 text-center">
                Seu cadastro será analisado pelo administrador antes da aprovação.
              </p>
            </div>
          )}
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

// ============================================================
// STUDENT REGISTRATION (simpler)
// ============================================================
type ReferralContext = {
  code: string;
  kind: "coach" | "student";
  sponsorName: string;
  coachId: string | null;
  referredByStudentId: string | null;
};

function StudentRegistration({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<CoachOption | null>(null);
  const [referral, setReferral] = useState<ReferralContext | null>(null);
  const [referralCoachName, setReferralCoachName] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("fitmind_referral");
      if (!raw) return;
      const parsed = JSON.parse(raw) as ReferralContext;
      if (!parsed?.code) return;
      setReferral(parsed);
      if (parsed.coachId) {
        setSelectedCoach({ id: parsed.coachId, profileId: "", name: parsed.sponsorName, referralCode: parsed.code } as unknown as CoachOption);
        // Se o sponsor for coach, o nome dele já é o nome do coach
        if (parsed.kind === "coach") {
          setReferralCoachName(parsed.sponsorName);
        } else {
          // Se o sponsor for um aluno (padrinho), buscamos o nome do coach vinculado
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
    if (password.length < 8) return setErr("A senha deve ter no mínimo 8 caracteres.");
    const coachIdToUse = referral?.coachId || selectedCoach?.id;
    if (!coachIdToUse) return setErr("Selecione seu coach para continuar.");

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
          student: {
            coachId: coachIdToUse,
            referredByStudentId: referral?.referredByStudentId || null,
            referralCode: referral?.code || null,
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
            <img src={fitmindLogo} alt="Logo FitMind Club" className="h-10 w-10 object-contain" />
            <span className="text-lg font-bold text-white">FitMind Club</span>
          </div>
          <h1 className="text-xl font-bold text-white">Cadastro de Aluno</h1>
        </div>

        <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A" }}>
          {referral && (
            <div className="mb-4 rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs text-white/80">
              <p className="font-semibold text-primary">Convite válido</p>
              <p className="mt-1">
                Você foi indicado(a) por <span className="font-semibold text-white">{referral.sponsorName}</span>
                {referral.kind === "student" ? " (padrinho)" : " (coach)"}. Seu coach já está vinculado automaticamente.
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
