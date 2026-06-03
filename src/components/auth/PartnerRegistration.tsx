import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Eye, EyeOff, Building2, UserCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { translateAuthError } from "@/lib/auth-errors";
import { maskCNPJ, maskCPF, maskPhone } from "@/lib/masks";
import { createAuthUser } from "@/components/auth/createAuthUser";
import { CheckEmailNotice } from "@/components/auth/CheckEmailNotice";
import { CoachSelector, type CoachOption } from "@/components/auth/CoachSelector";

type ReferralContext = {
  code: string;
  kind: "coach" | "student";
  sponsorName: string;
  coachId: string | null;
  referredByStudentId: string | null;
};

export function PartnerRegistration({ onBack, mode = "auto" }: { onBack: () => void; mode?: "auto" | "signup" | "existing" }) {
  const [fantasyName, setFantasyName] = useState("");
  const [docType, setDocType] = useState<"cnpj" | "cpf">("cnpj");
  const [doc, setDoc] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [createdForExisting, setCreatedForExisting] = useState(false);
  const [authProfile, setAuthProfile] = useState<{ id: string; user_id: string; email: string; name: string; phone: string | null } | null>(null);
  const [referral, setReferral] = useState<ReferralContext | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<CoachOption | null>(null);
  const [referralCoachName, setReferralCoachName] = useState<string>("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Detect logged-in user — if signed in, switch to "existing account" flow
  useEffect(() => {
    if (mode === "signup") return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, user_id, email, name, phone")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile) {
        setAuthProfile(profile as never);
        setEmail(profile.email || "");
        setResponsibleName(profile.name || "");
        if (profile.phone) setWhatsapp(profile.phone);
        // Se já tem coach vinculado (como aluno), usa esse coach automaticamente
        const { data: studentRow } = await supabase
          .from("students")
          .select("coach_id, coaches!students_coach_id_fkey(id, profile_id, profiles!coaches_profile_id_fkey(name))")
          .eq("profile_id", profile.id)
          .maybeSingle();
        const row = studentRow as unknown as { coach_id: string; coaches?: { id: string; profile_id: string; profiles?: { name?: string | null } | null } | null } | null;
        if (row?.coaches) {
          setSelectedCoach({ id: row.coaches.id, profileId: row.coaches.profile_id, name: row.coaches.profiles?.name || "Coach" });
        }
      }
    })();
  }, [mode]);

  // Captura referral (mesmo fluxo de aluno/coach)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("fitmind_referral");
      if (!raw) return;
      const parsed = JSON.parse(raw) as ReferralContext;
      if (!parsed?.code || !parsed.coachId) return;
      setReferral(parsed);
      if (parsed.kind === "coach") {
        setReferralCoachName(parsed.sponsorName);
      } else {
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
    } catch { /* ignore */ }
  }, []);

  const isExisting = mode === "existing" || (mode === "auto" && !!authProfile);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const setErr = (m: string) => { setFormError(m); toast.error(m); };
    if (!fantasyName.trim()) return setErr("Informe o nome fantasia da empresa.");
    if (!responsibleName.trim()) return setErr("Informe o nome do responsável.");
    if (doc.replace(/\D/g, "").length < (docType === "cnpj" ? 14 : 11)) return setErr(`${docType.toUpperCase()} incompleto.`);
    if (!email.includes("@") || !email.includes(".")) return setErr("E-mail inválido.");
    if (whatsapp.replace(/\D/g, "").length < 10) return setErr("WhatsApp incompleto.");
    if (!isExisting && password.length < 8) return setErr("A senha deve ter no mínimo 8 caracteres.");

    const uplineCoachId = referral?.coachId || selectedCoach?.id || null;
    if (!uplineCoachId) return setErr("Selecione um coach indicador para continuar.");

    setLoading(true);
    setFormError(null);
    try {
      let profileId: string | null = null;

      if (isExisting && authProfile) {
        profileId = authProfile.id;

        const { data: existingPartner } = await supabase
          .from("partners" as never)
          .select("id" as never)
          .eq("profile_id" as never, profileId)
          .maybeSingle();

        if (existingPartner) {
          throw new Error("Esta conta já possui um cadastro de parceiro.");
        }

        const { error: insertErr } = await supabase
          .from("partners" as never)
          .insert({
            profile_id: profileId,
            fantasy_name: fantasyName.trim(),
            document: doc.replace(/\D/g, ""),
            document_type: docType,
            whatsapp,
            city: city || null,
            state: state || null,
            status: "pending",
            upline_coach_id: uplineCoachId,
          } as never);
        if (insertErr) throw insertErr;

        await supabase
          .from("profiles")
          .update({ phone: whatsapp })
          .eq("id", profileId);

        setCreatedForExisting(true);
        toast.success("Cadastro de parceiro enviado para aprovação!");
        return;
      }

      // Fluxo padrão: cria nova conta de parceiro
      const user = await createAuthUser(email, password, responsibleName, "partner", {
        fantasy_name: fantasyName.trim(),
      });

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.id) {
        await supabase
          .from("partners" as never)
          .update({
            fantasy_name: fantasyName.trim(),
            document: doc.replace(/\D/g, ""),
            document_type: docType,
            whatsapp,
            city: city || null,
            state: state || null,
            upline_coach_id: uplineCoachId,
          } as never)
          .eq("profile_id" as never, profile.id);

        await supabase
          .from("profiles")
          .update({ name: responsibleName, phone: whatsapp })
          .eq("id", profile.id);
      }

      sessionStorage.removeItem("fitmind_referral");
      await supabase.auth.signOut().catch(() => {});
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

  if (registeredEmail) return <CheckEmailNotice email={registeredEmail} />;

  if (createdForExisting) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ backgroundColor: "#0A0A0A" }}>
        <div className="w-full max-w-md text-center text-white">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary mb-3">
            <Building2 className="h-3.5 w-3.5" /> Empresa Parceira
          </div>
          <h1 className="text-xl font-bold mb-2">Cadastro enviado!</h1>
          <p className="text-sm text-white/60 mb-6">Sua empresa está aguardando aprovação. Você poderá acessar o painel de parceiro assim que for aprovada.</p>
          <Button onClick={onBack} className="w-full">Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <Logo className="h-10 w-10 object-contain" />
            <span className="text-lg font-bold text-white">FitMind Club</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary mb-2">
            <Building2 className="h-3.5 w-3.5" /> Empresa Parceira
          </div>
          <h1 className="text-xl font-bold text-white">{isExisting ? "Tornar-se Parceiro" : "Cadastro de Parceiro"}</h1>
          <p className="mt-1 text-xs text-white/50">{isExisting ? "Vincule sua empresa à sua conta atual. Após análise, o painel de parceiro será liberado." : "Após confirmar o e-mail, sua empresa passa por aprovação."}</p>
        </div>

        <div className="rounded-2xl p-6" style={{ backgroundColor: "#1A1A1A" }}>
          {referral && (
            <div className="mb-4 rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs text-white/80">
              <p className="font-semibold text-primary">Convite válido</p>
              <p className="mt-1">Indicado(a) por <span className="font-semibold text-white">{referral.sponsorName}</span>. Coach vinculado automaticamente.</p>
            </div>
          )}
          {formError && (
            <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {formError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">Nome fantasia</Label>
              <Input value={fantasyName} onChange={(e) => setFantasyName(e.target.value)} placeholder="Ex: Açaí do Bairro" className="bg-white/5 border-white/10 text-white" required />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-white/70 text-xs">Tipo</Label>
                <select value={docType} onChange={(e) => { setDocType(e.target.value as "cnpj" | "cpf"); setDoc(""); }} className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-2 py-2 text-white text-sm">
                  <option value="cnpj">CNPJ</option>
                  <option value="cpf">CPF</option>
                </select>
              </div>
              <div className="col-span-2">
                <Label className="text-white/70 text-xs">{docType.toUpperCase()}</Label>
                <Input value={doc} onChange={(e) => setDoc(docType === "cnpj" ? maskCNPJ(e.target.value) : maskCPF(e.target.value))} placeholder={docType === "cnpj" ? "00.000.000/0000-00" : "000.000.000-00"} className="bg-white/5 border-white/10 text-white" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">Nome do responsável</Label>
              <Input value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} placeholder="Seu nome" className="bg-white/5 border-white/10 text-white" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">E-mail {isExisting ? "(da sua conta)" : "(login)"}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@empresa.com" className="bg-white/5 border-white/10 text-white" required disabled={isExisting} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">WhatsApp</Label>
              <Input value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value))} placeholder="(11) 99999-9999" className="bg-white/5 border-white/10 text-white" required />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label className="text-white/70 text-xs">Cidade</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} className="bg-white/5 border-white/10 text-white" />
              </div>
              <div>
                <Label className="text-white/70 text-xs">UF</Label>
                <Input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} className="bg-white/5 border-white/10 text-white" />
              </div>
            </div>

            {/* Coach indicador */}
            {referral ? (
              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs">Coach indicador</Label>
                <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-white">{referralCoachName || "Carregando..."}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-primary/80 font-bold">Vinculado</span>
                </div>
              </div>
            ) : isExisting && selectedCoach ? (
              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs">Coach vinculado</Label>
                <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-white">{selectedCoach.name}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-primary/80 font-bold">Da sua conta</span>
                </div>
              </div>
            ) : (
              <CoachSelector value={selectedCoach} onChange={setSelectedCoach} />
            )}

            {!isExisting && (
              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs">Senha</Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" className="bg-white/5 border-white/10 text-white pr-10" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onBack} className="flex-1 border-white/10 text-white/70">
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : isExisting ? "Enviar para aprovação" : "Criar conta"}
              </Button>
            </div>
          </form>
        </div>

        <div className="mt-4 text-center text-sm text-white/40">
          Já tem conta? <Link to="/login" className="font-medium text-primary hover:underline">Entrar</Link>
        </div>
      </div>
    </div>
  );
}
