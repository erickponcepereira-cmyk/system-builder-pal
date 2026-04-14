import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame, ArrowLeft, ArrowRight, User, Dumbbell, Loader2, Eye, EyeOff, Check, Upload } from "lucide-react";
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SearchParams = { role?: string };

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Cadastro — FitChain" },
      { name: "description", content: "Cadastre-se como coach ou aluno na plataforma FitChain." },
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Flame className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-white">FitChain</span>
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
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [bankName, setBankName] = useState("");
  const [bankAgency, setBankAgency] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountType, setBankAccountType] = useState("corrente");
  const [acceptTerms, setAcceptTerms] = useState(false);

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

  const validateStep1 = () => {
    if (!name || !cpf || !email || !phone || !birthdate || !password || !confirmPassword) {
      toast.error("Preencha todos os campos obrigatórios");
      return false;
    }
    if (password.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres");
      return false;
    }
    if (!/[A-Z]/.test(password)) {
      toast.error("A senha deve ter pelo menos 1 letra maiúscula");
      return false;
    }
    if (!/[0-9]/.test(password)) {
      toast.error("A senha deve ter pelo menos 1 número");
      return false;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!cep || !number) {
      toast.error("Preencha CEP e número");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!acceptTerms) {
      toast.error("Aceite os termos de uso para continuar");
      return;
    }
    if (!pixKey) {
      toast.error("Informe sua chave PIX");
      return;
    }

    setLoading(true);
    try {
      const referralCode = generateReferralCode();

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role: "coach",
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (authError) {
        toast.error(authError.message);
        return;
      }

      if (authData.user) {
        // Update profile with additional data
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", authData.user.id)
          .single();

        if (profileData) {
          await supabase
            .from("profiles")
            .update({
              cpf: cpf.replace(/\D/g, ""),
              phone: phone.replace(/\D/g, ""),
              birthdate,
              bio,
              street,
              number,
              neighborhood,
              city,
              state,
              zip_code: cep.replace(/\D/g, ""),
            })
            .eq("id", profileData.id);

          // Create coach record (pending approval)
          await supabase.from("coaches").insert({
            profile_id: profileData.id,
            referral_code: referralCode,
            referral_link: `${window.location.origin}/r/${referralCode}`,
            pix_key: pixKey,
            pix_key_type: pixKeyType,
            bank_name: bankName || null,
            bank_agency: bankAgency || null,
            bank_account: bankAccount || null,
            bank_account_type: bankAccountType,
          });
        }

        toast.success("Cadastro enviado com sucesso!");
        navigate({ to: "/register/pending" as string });
      }
    } catch {
      toast.error("Erro ao criar conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Flame className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-white">FitChain</span>
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
                {s === 1 ? "Dados Pessoais" : s === 2 ? "Endereço" : "Bancário"}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A" }}>
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
                <Button onClick={() => validateStep1() && setStep(2)} className="flex-1">
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
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button onClick={() => validateStep2() && setStep(3)} className="flex-1">
                  Próximo <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-white/70">Tipo da chave PIX *</Label>
                <select
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 py-1 text-sm text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="cpf">CPF</option>
                  <option value="email">E-mail</option>
                  <option value="phone">Telefone</option>
                  <option value="random">Aleatória</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Chave PIX *</Label>
                <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Sua chave PIX" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Banco</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Nome do banco" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white/70">Agência</Label>
                  <Input value={bankAgency} onChange={(e) => setBankAgency(e.target.value)} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70">Conta</Label>
                  <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Tipo de conta</Label>
                <select
                  value={bankAccountType}
                  onChange={(e) => setBankAccountType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 py-1 text-sm text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                </select>
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
                  <button type="button" className="text-primary hover:underline">Política de Privacidade</button> da FitChain.
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
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
function StudentRegistration({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role: "student" },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data.user) {
        // Update phone
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", data.user.id)
          .single();

        if (profileData) {
          await supabase
            .from("profiles")
            .update({ phone: phone.replace(/\D/g, "") })
            .eq("id", profileData.id);
        }

        toast.success("Conta criada com sucesso! Verifique seu e-mail.");
        navigate({ to: "/login" });
      }
    } catch {
      toast.error("Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Flame className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-white">FitChain</span>
          </div>
          <h1 className="text-xl font-bold text-white">Cadastro de Aluno</h1>
        </div>

        <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A" }}>
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
