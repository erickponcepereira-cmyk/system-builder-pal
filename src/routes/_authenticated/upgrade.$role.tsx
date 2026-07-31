import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CoachSelector, type CoachOption } from "@/components/auth/CoachSelector";
import { maskCNPJ, maskCPF, maskPhone } from "@/lib/masks";
import { toast } from "sonner";
import { readReferralSignup } from "@/lib/referral-signup";

export const Route = createFileRoute("/_authenticated/upgrade/$role")({
  component: UpgradePage,
});

type Specialty = { key: string; label: string; description: string | null; requires_admin_setup: boolean };

const TITLES: Record<string, { title: string; subtitle: string }> = {
  coach: { title: "Tornar-se Coach", subtitle: "Usamos a sua conta atual — nada de criar um novo cadastro." },
  professional: { title: "Tornar-se Profissional", subtitle: "Usamos a sua conta atual — nada de criar um novo cadastro." },
  partner: { title: "Tornar-se Empresa Parceira", subtitle: "Usamos a sua conta atual — nada de criar um novo cadastro." },
};

function UpgradePage() {
  const { role } = useParams({ from: "/_authenticated/upgrade/$role" });
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [upline, setUpline] = useState<CoachOption | null>(null);
  const [uplineLocked, setUplineLocked] = useState(false);

  // coach
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");

  // professional
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialtyKey, setSpecialtyKey] = useState("");
  const [specialtyCustom, setSpecialtyCustom] = useState("");
  const [council, setCouncil] = useState("");
  const [councilNumber, setCouncilNumber] = useState("");

  // partner
  const [fantasyName, setFantasyName] = useState("");
  const [documentType, setDocumentType] = useState<"cnpj" | "cpf">("cnpj");
  const [document, setDocument] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [businessArea, setBusinessArea] = useState("");

  const meta = TITLES[role] ?? TITLES.coach;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();

    // Indicação vinda do link /r/{code} (inclusive via loja pública e Google).
    const ref = readReferralSignup();
    if (ref.coachId) {
      setUpline({ id: ref.coachId, profileId: "", name: ref.sponsorName || "Coach indicador" });
      setUplineLocked(true);
    }
  }, []);

  useEffect(() => {
    if (role !== "professional") return;
    (async () => {
      const { data } = await supabase
        .from("professional_specialties")
        .select("key,label,description,requires_admin_setup")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setSpecialties(((data as Specialty[] | null) || []));
    })();
  }, [role]);

  const selectedSpec = specialties.find((s) => s.key === specialtyKey);

  async function submit() {
    setErr(null);
    if (!userId) return setErr("Sessão expirada. Entre novamente.");
    if (!upline?.id) return setErr("Selecione um coach indicador.");
    setLoading(true);
    try {
      if (role === "coach") {
        const { upgradeExistingToCoachFn } = await import("@/lib/registration.functions");
        await upgradeExistingToCoachFn({
          data: {
            userId,
            uplineCoachId: upline.id,
            pixKey: pixKey.trim() || null,
            pixKeyType: pixKey.trim() ? pixKeyType : null,
            alreadyCoach: false,
            activationNote: null,
          },
        });
        toast.success("Cadastro de coach enviado! Acompanhe a liberação no seu painel.");
        navigate({ to: "/coach" });
      } else if (role === "professional") {
        if (!specialtyKey) throw new Error("Selecione sua área de atuação.");
        if (selectedSpec?.requires_admin_setup && specialtyCustom.trim().length < 3)
          throw new Error("Descreva sua área de atuação.");
        const { upgradeExistingToProfessionalFn } = await import("@/lib/registration.functions");
        await upgradeExistingToProfessionalFn({
          data: {
            userId,
            uplineCoachId: upline.id,
            specialtyKey,
            specialtyCustomDescription: selectedSpec?.requires_admin_setup ? specialtyCustom.trim() : null,
            professionalCouncil: council.trim() || null,
            councilNumber: councilNumber.trim() || null,
            specialtyPendingSetup: !!selectedSpec?.requires_admin_setup,
          },
        });
        toast.success("Cadastro de profissional enviado para aprovação.");
        navigate({ to: "/student/profile" });
      } else {
        if (fantasyName.trim().length < 2) throw new Error("Informe o nome da empresa.");
        if (document.replace(/\D/g, "").length < 11) throw new Error("Informe um documento válido.");
        if (whatsapp.replace(/\D/g, "").length < 10) throw new Error("Informe um WhatsApp válido.");
        const { upgradeExistingToPartnerFn } = await import("@/lib/registration.functions");
        await upgradeExistingToPartnerFn({
          data: {
            userId,
            fantasyName: fantasyName.trim(),
            document,
            documentType,
            whatsapp,
            city: city.trim() || null,
            state: uf.trim() || null,
            businessArea: businessArea.trim() || null,
            uplineCoachId: upline.id,
          },
        });
        toast.success("Cadastro de empresa parceira enviado para aprovação.");
        navigate({ to: "/partner" });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível concluir o cadastro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-10">
      <header className="flex items-center gap-3 pt-2">
        <Link to="/student/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
          <ChevronLeft className="h-5 w-5 text-white" />
        </Link>
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider">Sua conta atual</p>
          <h1 className="text-2xl font-bold text-white">{meta.title}</h1>
        </div>
      </header>

      <div className="flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-white/70">{meta.subtitle}</p>
      </div>

      {err && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{err}</div>
      )}

      <div className="space-y-4 rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
        {role === "coach" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-white/70">Tipo da chave Pix</Label>
                <Select value={pixKeyType} onValueChange={setPixKeyType}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-white/10 text-white z-[100]">
                    {["cpf", "cnpj", "email", "telefone", "aleatoria"].map((t) => (
                      <SelectItem key={t} value={t} className="text-white focus:bg-white/10 focus:text-white">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-white/70">Chave Pix (para receber comissões)</Label>
                <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} className="bg-white/5 border-white/10 text-white" />
              </div>
            </div>
          </>
        )}

        {role === "professional" && (
          <>
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
              {selectedSpec?.requires_admin_setup && (
                <Input
                  value={specialtyCustom}
                  onChange={(e) => setSpecialtyCustom(e.target.value.slice(0, 200))}
                  placeholder="Descreva sua área de atuação"
                  className="bg-white/5 border-white/10 text-white"
                />
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
          </>
        )}

        {role === "partner" && (
          <>
            <div className="space-y-2">
              <Label className="text-white/70">Nome fantasia *</Label>
              <Input value={fantasyName} onChange={(e) => setFantasyName(e.target.value)} className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-white/70">Tipo</Label>
                <Select value={documentType} onValueChange={(v) => { setDocumentType(v as "cnpj" | "cpf"); setDocument(""); }}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-white/10 text-white z-[100]">
                    <SelectItem value="cnpj" className="text-white focus:bg-white/10 focus:text-white">CNPJ</SelectItem>
                    <SelectItem value="cpf" className="text-white focus:bg-white/10 focus:text-white">CPF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-white/70">{documentType === "cnpj" ? "CNPJ *" : "CPF *"}</Label>
                <Input
                  value={document}
                  onChange={(e) => setDocument(documentType === "cnpj" ? maskCNPJ(e.target.value) : maskCPF(e.target.value))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-white/70">WhatsApp *</Label>
                <Input value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value))} className="bg-white/5 border-white/10 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Ramo de atuação</Label>
                <Input value={businessArea} onChange={(e) => setBusinessArea(e.target.value)} placeholder="Academia, restaurante..." className="bg-white/5 border-white/10 text-white" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label className="text-white/70">Cidade</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} className="bg-white/5 border-white/10 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">UF</Label>
                <Input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} className="bg-white/5 border-white/10 text-white" />
              </div>
            </div>
          </>
        )}

        <CoachSelector value={upline} onChange={setUpline} locked={uplineLocked} />
      </div>

      <Button size="lg" className="w-full gap-2" disabled={loading} onClick={submit}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Enviar cadastro
      </Button>
    </div>
  );
}
