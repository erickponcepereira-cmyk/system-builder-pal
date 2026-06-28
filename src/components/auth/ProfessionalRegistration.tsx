import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Loader2, Eye, EyeOff, Stethoscope } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CoachSelector, type CoachOption } from "@/components/auth/CoachSelector";
import { finalizeRegistrationFn, upgradeExistingToProfessionalFn } from "@/lib/registration.functions";
import { checkEmailAvailable } from "@/lib/email-check.functions";
import { translateAuthError } from "@/lib/auth-errors";
import { maskCPF, maskPhone, generateReferralCode, isValidCPF } from "@/lib/masks";
import { createAuthUser } from "@/components/auth/createAuthUser";
import { CheckEmailNotice } from "@/components/auth/CheckEmailNotice";

type Specialty = { key: string; label: string; description: string | null; requires_admin_setup: boolean };

export function ProfessionalRegistration({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialtyKey, setSpecialtyKey] = useState("");
  const [specialtyCustom, setSpecialtyCustom] = useState("");
  const [council, setCouncil] = useState("");
  const [councilNumber, setCouncilNumber] = useState("");

  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [phone, setPhone] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [existingMode, setExistingMode] = useState(false); // vinculação a conta existente

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<CoachOption | null>(null);
  const [coachLocked, setCoachLocked] = useState(false);
  const [alreadyProfessional, setAlreadyProfessional] = useState<"yes" | "no" | "">("");
  const [alreadyProfessionalNote, setAlreadyProfessionalNote] = useState("");

  // Captura referral da sessão (link /r/:code) — trava o coach indicador
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("fitmind_referral");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { coachId?: string; sponsorName?: string };
      if (!parsed?.coachId) return;
      (async () => {
        const { data } = await supabase
          .from("coaches")
          .select("id, profile_id, profiles!coaches_profile_id_fkey(name)")
          .eq("id", parsed.coachId!)
          .maybeSingle();
        const row = data as unknown as { id: string; profile_id: string; profiles?: { name?: string | null } | null } | null;
        if (row) {
          setSelectedCoach({ id: row.id, profileId: row.profile_id, name: row.profiles?.name || parsed.sponsorName || "Coach" });
          setCoachLocked(true);
        }
      })();
    } catch { /* ignore */ }
  }, []);

  // Se o e-mail já tem conta com coach vinculado (como aluno/coach), trava também
  useEffect(() => {
    if (!existingMode || !email) return;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();
      if (!prof?.id) return;
      const [{ data: studentRow }, { data: coachRow }] = await Promise.all([
        supabase
          .from("students")
          .select("coaches!students_coach_id_fkey(id, profile_id, profiles!coaches_profile_id_fkey(name))")
          .eq("profile_id", prof.id)
          .maybeSingle(),
        supabase
          .from("coaches")
          .select("upline_coach_id, upline:coaches!coaches_upline_coach_id_fkey(id, profile_id, profiles!coaches_profile_id_fkey(name))")
          .eq("profile_id", prof.id)
          .maybeSingle(),
      ]);
      const fromCoach = (coachRow as unknown as { upline?: { id: string; profile_id: string; profiles?: { name?: string | null } | null } | null } | null)?.upline;
      const fromStudent = (studentRow as unknown as { coaches?: { id: string; profile_id: string; profiles?: { name?: string | null } | null } | null } | null)?.coaches;
      const linked = fromCoach || fromStudent;
      if (linked) {
        setSelectedCoach({ id: linked.id, profileId: linked.profile_id, name: linked.profiles?.name || "Coach" });
        setCoachLocked(true);
      }
    })();
  }, [existingMode, email]);


  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("professional_specialties")
        .select("key,label,description,requires_admin_setup")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setSpecialties((data as Specialty[]) || []);
    })();
  }, []);

  useEffect(() => {
    if (!email) { setEmailStatus("idle"); setExistingMode(false); return; }
    if (!email.includes("@") || !email.includes(".")) { setEmailStatus("invalid"); return; }
    setEmailStatus("checking");
    const handle = window.setTimeout(async () => {
      try {
        const res = await checkEmailAvailable({ data: { email } });
        const taken = !res.available;
        setEmailStatus(taken ? "taken" : "available");
        setExistingMode(taken);
      } catch { setEmailStatus("idle"); }
    }, 500);
    return () => window.clearTimeout(handle);
  }, [email]);

  const fail = (msg: string) => { setFormError(msg); toast.error(msg); return false; };

  const validateStep1 = () => {
    if (!specialtyKey) return fail("Selecione sua área de atuação.");
    if (selectedSpec?.requires_admin_setup && specialtyCustom.trim().length < 3)
      return fail("Descreva sua área de atuação para que o admin possa configurar seu painel.");
    if (existingMode) {
      if (!email || !password) return fail("Informe e-mail e senha da sua conta existente.");
    } else {
      if (!name || !cpf || !email || !phone || !birthdate || !password || !confirmPassword)
        return fail("Preencha todos os campos obrigatórios.");
      if (emailStatus === "checking") return fail("Aguarde a verificação do e-mail.");
      if (cpf.replace(/\D/g, "").length !== 11) return fail("CPF inválido. Verifique os dados informados.");
      if (!isValidCPF(cpf)) return fail("CPF inválido. Verifique os dados informados.");
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
        return fail("Senha: 8+ chars, 1 maiúscula e 1 número.");
      if (password !== confirmPassword) return fail("As senhas não coincidem.");
    }
    setFormError(null); return true;
  };

  const handleSubmit = async () => {
    if (!acceptTerms) return fail("Aceite os Termos de Uso para continuar.");
    if (!alreadyProfessional) return fail("Informe se você já é coach/profissional FitMind.");

    const isAlreadyPro = alreadyProfessional === "yes";
    const nowIso = new Date().toISOString();
    const activationExtras = isAlreadyPro
      ? {
          already_coach: true,
          activation_paid_at: nowIso,
          activation_source: "already_professional",
          activation_note: alreadyProfessionalNote.trim() || null,
        }
      : {};

    setLoading(true); setFormError(null);
    try {
      const selectedSpecLocal = specialties.find((s) => s.key === specialtyKey);
      const professionalPatch = {
        is_professional: true,
        specialty_key: specialtyKey,
        specialty_custom_description: selectedSpecLocal?.requires_admin_setup ? specialtyCustom.trim() : null,
        professional_council: council || null,
        council_number: councilNumber || null,
        specialty_pending_setup: !!selectedSpecLocal?.requires_admin_setup,
        approved_at: new Date().toISOString(),
        onboarding_stage: "released",
      };

      if (existingMode) {
        // Autentica para obter o user.id e então delega para a server fn privilegiada,
        // que escreve em coaches via service role (o trigger guard_coaches_self_update
        // só permite alterar campos protegidos quando auth.uid() é admin ou nulo).
        const { data: signIn, error: signErr } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (signErr || !signIn.user) {
          throw new Error("Senha incorreta para esta conta. Use a senha que você já usa no FitMind.");
        }

        // upline: usa coach selecionado ou, se já existe linha, mantém o atual
        let uplineCoachId = selectedCoach?.id || null;
        if (!uplineCoachId) {
          const { data: prof } = await supabase
            .from("profiles").select("id").eq("user_id", signIn.user.id).maybeSingle();
          if (prof?.id) {
            const { data: existingCoach } = await supabase
              .from("coaches").select("upline_coach_id").eq("profile_id", prof.id).maybeSingle();
            uplineCoachId = (existingCoach as { upline_coach_id?: string } | null)?.upline_coach_id || null;
          }
        }
        if (!uplineCoachId) throw new Error("Selecione o coach indicador.");

        await upgradeExistingToProfessionalFn({
          data: {
            userId: signIn.user.id,
            uplineCoachId,
            specialtyKey,
            specialtyCustomDescription: selectedSpecLocal?.requires_admin_setup ? specialtyCustom.trim() : null,
            professionalCouncil: council || null,
            councilNumber: councilNumber || null,
            specialtyPendingSetup: !!selectedSpecLocal?.requires_admin_setup,
            alreadyProfessional: isAlreadyPro,
            activationNote: alreadyProfessionalNote.trim() || null,
          },
        });

        await supabase.auth.signOut().catch(() => {});
        setRegisteredEmail(email.trim().toLowerCase());
        toast.success("Conta vinculada como profissional! Acesso de coach liberado.");
        return;
      }

      // Conta nova — fluxo padrão via server function
      if (!selectedCoach) return fail("Selecione o coach que te indicou.");
      const referralCode = generateReferralCode();
      const user = await createAuthUser(email, password, name, "coach");

      await finalizeRegistrationFn({
        data: {
          userId: user.id, role: "coach",
          name, email, phone, cpf, birthdate,
          coach: {
            uplineCoachId: selectedCoach.id,
            referralCode,
            referralLink: `${window.location.origin}/r/${referralCode}`,
            completedCoachCourse: false,
            alreadyCoach: isAlreadyPro,
            activationNote: alreadyProfessionalNote.trim() || null,
            isProfessional: true,
            specialtyKey,
            specialtyCustomDescription: selectedSpecLocal?.requires_admin_setup ? specialtyCustom.trim() : null,
            professionalCouncil: council || null,
            councilNumber: councilNumber || null,
          },
        },
      });
      await supabase.auth.signOut().catch(() => {});
      setRegisteredEmail(email.trim().toLowerCase());
      toast.success("Cadastro profissional criado com acesso de coach liberado.");
    } catch (error) {
      const friendly = translateAuthError(error);
      setFormError(friendly); toast.error(friendly);
    } finally { setLoading(false); }
  };


  if (registeredEmail) return <CheckEmailNotice email={registeredEmail} />;

  const selectedSpec = specialties.find((s) => s.key === specialtyKey);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <Logo className="h-10 w-10 object-contain" />
            <span className="text-lg font-bold text-white">FitMind Club</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-2">
            <Stethoscope className="h-3.5 w-3.5" /> Profissional da saúde
          </div>
          <h1 className="text-xl font-bold text-white">Cadastro de Profissional</h1>
          <p className="mt-1 text-xs text-white/50">Você fará parte da rede de coaches com painel personalizado.</p>
        </div>

        <div className="mb-6 flex items-center gap-2">
          {[1, 2].map((s) => (
            <div key={s} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-white/10"}`} />
              <p className="mt-1 text-[10px] text-white/40 text-center">{s === 1 ? "Dados & Atuação" : "Indicação"}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A" }}>
          {formError && (
            <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{formError}</div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-white/70">Área de atuação *</Label>
                <Select value={specialtyKey} onValueChange={setSpecialtyKey}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Selecione sua especialidade" />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-white/10 text-white z-[100]">
                    {specialties.map((s) => (
                      <SelectItem key={s.key} value={s.key} className="text-white focus:bg-white/10 focus:text-white">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSpec?.description && <p className="text-[11px] text-white/40">{selectedSpec.description}</p>}
                {selectedSpec?.requires_admin_setup && (
                  <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                    <Label className="text-amber-300 text-xs">Descreva sua área de atuação *</Label>
                    <Input
                      value={specialtyCustom}
                      onChange={(e) => setSpecialtyCustom(e.target.value.slice(0, 200))}
                      placeholder="Ex.: Fisioterapeuta esportivo, Psicólogo clínico..."
                      className="bg-white/5 border-white/10 text-white"
                    />
                    <p className="text-[11px] text-amber-400">⚠️ O admin será notificado para configurar seu painel personalizado após aprovação.</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white/70">Conselho</Label>
                  <Input value={council} onChange={(e) => setCouncil(e.target.value.toUpperCase())} placeholder="CRN, CREF, CRM..." className="bg-white/5 border-white/10 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70">Nº de registro</Label>
                  <Input value={councilNumber} onChange={(e) => setCouncilNumber(e.target.value)} placeholder="12345/SP" className="bg-white/5 border-white/10 text-white" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white/70">E-mail *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value.trim().toLowerCase())} className={`bg-white/5 text-white ${emailStatus === "taken" ? "border-amber-500" : emailStatus === "available" ? "border-success" : "border-white/10"}`} required />
                {emailStatus === "checking" && <p className="text-[11px] text-white/40">Verificando...</p>}
                {emailStatus === "taken" && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
                    Este e-mail já tem conta no FitMind. Confirme sua senha abaixo para <strong>vincular esta conta como Profissional</strong> (ainda passa por aprovação do admin).
                  </div>
                )}
              </div>

              {!existingMode && (
                <>
                  <div className="space-y-2">
                    <Label className="text-white/70">Nome completo *</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white/5 border-white/10 text-white" required />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/70">CPF *</Label>
                    <Input value={cpf} onChange={(e) => setCpf(maskCPF(e.target.value))} placeholder="000.000.000-00" className="bg-white/5 border-white/10 text-white" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-white/70">WhatsApp *</Label>
                      <Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" className="bg-white/5 border-white/10 text-white" required />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/70">Nascimento *</Label>
                      <Input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} className="bg-white/5 border-white/10 text-white" required />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label className="text-white/70">{existingMode ? "Sua senha atual *" : "Senha *"}</Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={existingMode ? "Senha que você usa para entrar" : "Mín. 8 chars, 1 maiúscula, 1 número"} className="bg-white/5 border-white/10 text-white pr-10" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {!existingMode && (
                <div className="space-y-2">
                  <Label className="text-white/70">Confirmar senha *</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="bg-white/5 border-white/10 text-white" required />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={onBack} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button onClick={() => { if (validateStep1()) setStep(2); }} className="flex-1">
                  Próximo <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {coachLocked ? (
                <CoachSelector value={selectedCoach} onChange={setSelectedCoach} locked />
              ) : existingMode ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <p className="text-xs text-white/80">
                    Identificamos seu cadastro. Vamos manter o <strong>coach indicador atual</strong> da sua conta.
                  </p>
                  <p className="text-[11px] text-white/50">
                    Quer indicar outro coach? Selecione abaixo (opcional):
                  </p>
                  <CoachSelector value={selectedCoach} onChange={setSelectedCoach} label="Trocar coach indicador (opcional)" />
                </div>
              ) : (
                <CoachSelector value={selectedCoach} onChange={setSelectedCoach} />
              )}


              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <Label className="text-white/80 text-sm">Você já é coach/profissional FitMind? *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAlreadyProfessional("yes")}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${alreadyProfessional === "yes" ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}
                  >Sim, já sou</button>
                  <button
                    type="button"
                    onClick={() => setAlreadyProfessional("no")}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${alreadyProfessional === "no" ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}
                  >Ainda não</button>
                </div>
                {alreadyProfessional === "yes" && (
                  <Input
                    value={alreadyProfessionalNote}
                    onChange={(e) => setAlreadyProfessionalNote(e.target.value)}
                    placeholder="Ex: já fiz curso de coach em 2024"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  />
                )}
                <p className="text-[11px] text-white/40">
                  {alreadyProfessional === "yes"
                    ? "A anuidade (R$ 179,90) será marcada como já paga e ficará registrada para o admin."
                    : alreadyProfessional === "no"
                    ? "Após o cadastro, a anuidade (R$ 179,90) será cobrada antes da liberação completa."
                    : "Esta informação determina se a anuidade será cobrada."}
                </p>
              </div>

              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-1" />
                <span className="text-xs text-white/60">
                  Aceito os <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Termos de Uso</a>,{" "}
                  os <a href="/termos-compra" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Termos de Compra</a> e a{" "}
                  <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Política de Privacidade</a>.
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Concluir cadastro"}
                </Button>
              </div>
            </div>
          )}

        </div>

        <div className="mt-6 text-center text-sm text-white/40">
          Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
        </div>
      </div>
    </div>
  );
}
