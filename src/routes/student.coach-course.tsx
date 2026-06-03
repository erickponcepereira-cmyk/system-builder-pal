import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  GraduationCap,
  Brain,
  Sparkles,
  CheckCircle2,
  Clock,
  MessageCircle,
  ShoppingCart,
  Loader2,
  TrendingUp,
  Users,
  Trophy,
  Award,
  UserPlus,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { whatsappUrl } from "@/lib/whatsapp";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";
import { ACTIVATION_PRODUCT_ID } from "@/lib/coach-onboarding.functions";
import { CoachSelector, type CoachOption } from "@/components/auth/CoachSelector";
import { toast } from "sonner";

export const Route = createFileRoute("/student/coach-course")({ component: CoachCoursePage });

type CoachInfo = { name: string | null; phone: string | null; avatar_url: string | null };
type ApplicationRow = { id: string; status: string; admin_notes: string | null; created_at: string | null };

const ACTIVATION_PRICE = 179.9;

function CoachCoursePage() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [userPhone, setUserPhone] = useState<string>("");
  const [userCity, setUserCity] = useState<string>("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [courseStatus, setCourseStatus] = useState<"pendente" | "em_andamento" | "concluido">("pendente");
  const [profileStatus, setProfileStatus] = useState<"nao_iniciada" | "concluida">("nao_iniciada");
  const [uplineCoach, setUplineCoach] = useState<CoachInfo | null>(null);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [application, setApplication] = useState<ApplicationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState<number>(ACTIVATION_PRICE);

  // Application form state
  const [motivation, setMotivation] = useState("");
  const [experience, setExperience] = useState("");
  const [selectedUpline, setSelectedUpline] = useState<CoachOption | null>(null);
  const [submitting, setSubmitting] = useState(false);


  // (data loading moved into loadAll below)


  const loadAll = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setLoading(false); return; }
    setUserEmail(userData.user.email || "");

    const { data: profile } = await supabase
      .from("profiles")
      .select("id,name,phone,city")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile) { setLoading(false); return; }
    setProfileId(profile.id);
    setUserName(profile.name || "");
    setUserPhone(profile.phone || "");
    setUserCity(profile.city || "");

    const { data: student } = await supabase
      .from("students")
      .select("id, coach_id, coach_course_completed_at")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!student) { setLoading(false); return; }
    setStudentId(student.id);

    // Course aggregated status
    const [requiredRes, progressRes, ordersRes, appRes] = await Promise.all([
      supabase.from("coach_course_modules" as never).select("id" as never).eq("is_active" as never, true as never).eq("is_required" as never, true as never),
      supabase.from("coach_course_progress" as never).select("module_id" as never).eq("student_id" as never, student.id as never),
      supabase
        .from("store_orders" as never)
        .select("id, status, store_order_items(product_id, store_product_id, digital_product_id)" as never)
        .eq("student_id" as never, student.id as never)
        .eq("status" as never, "paid" as never),
      supabase
        .from("coach_applications" as never)
        .select("id, status, admin_notes, created_at" as never)
        .eq("student_id" as never, student.id as never)
        .order("created_at" as never, { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const requiredIds = ((requiredRes.data as unknown as { id: string }[]) || []).map((r) => r.id);
    const completedIds = new Set(((progressRes.data as unknown as { module_id: string }[]) || []).map((r) => r.module_id));
    const requiredDone = requiredIds.filter((id) => completedIds.has(id)).length;
    if (student.coach_course_completed_at || (requiredIds.length > 0 && requiredDone === requiredIds.length)) setCourseStatus("concluido");
    else if (progressRes.data && (progressRes.data as unknown[]).length > 0) setCourseStatus("em_andamento");
    else setCourseStatus("pendente");

    // Purchase check
    const orders = (ordersRes.data as unknown as Array<{ store_order_items?: Array<{ product_id?: string | null; store_product_id?: string | null; digital_product_id?: string | null }> }>) || [];
    const purchased = orders.some((o) => (o.store_order_items || []).some((i) =>
      i.product_id === ACTIVATION_PRODUCT_ID ||
      i.store_product_id === ACTIVATION_PRODUCT_ID ||
      i.digital_product_id === ACTIVATION_PRODUCT_ID
    ));
    setHasPurchased(purchased);
    setApplication((appRes.data as unknown as ApplicationRow) || null);

    // Upline coach
    if (student.coach_id) {
      const { data: coachRow } = await supabase.from("coaches").select("profile_id").eq("id", student.coach_id).maybeSingle();
      if (coachRow?.profile_id) {
        const { data: coachProfile } = await supabase
          .from("profiles")
          .select("name, phone, avatar_url")
          .eq("id", coachRow.profile_id)
          .maybeSingle();
        if (coachProfile) setUplineCoach(coachProfile as CoachInfo);
      }
    }

    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const startCheckout = async () => {
    if (!profileId) return toast.error("Perfil não encontrado");
    setCreatingOrder(true);
    try {
      const { data: orderIdRpc, error } = await supabase.rpc("create_store_order" as never, {
        _items: [{ kind: "digital", sourceId: ACTIVATION_PRODUCT_ID, quantity: 1 }],
        _payment_method: "pix",
        _shipping: {},
        _notes: "Ativação Coach - Trilha",
      } as never);
      if (error) throw new Error(error.message);
      const { data: order } = await supabase
        .from("store_orders" as never)
        .select("id,total_amount" as never)
        .eq("id" as never, orderIdRpc as never)
        .maybeSingle();
      const od = order as unknown as { id: string; total_amount: number } | null;
      setOrderId(od?.id || String(orderIdRpc));
      setOrderTotal(Number(od?.total_amount || ACTIVATION_PRICE));
      setShowCheckout(true);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao criar pedido");
    } finally {
      setCreatingOrder(false);
    }
  };

  const submitApplication = async () => {
    if (!selectedUpline) return toast.error("Selecione o coach da rede onde você vai entrar");
    if (motivation.trim().length < 20) return toast.error("Conte sua motivação com mais detalhes");
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("submit_coach_application" as never, {
        _motivation: motivation,
        _experience: experience || null,
        _city: userCity || null,
        _phone: userPhone || null,
        _selected_upline_coach_id: selectedUpline.id,
      } as never);
      if (error) throw new Error(error.message);
      toast.success("Inscrição enviada! Aguarde a aprovação.");
      setShowApply(false);
      await loadAll();
    } catch (e) {
      toast.error((e as Error).message || "Falha ao enviar inscrição");
    } finally {
      setSubmitting(false);
    }
  };


  const waLink = whatsappUrl(
    uplineCoach?.phone,
    `Olá ${uplineCoach?.name || ""}! Quero entender melhor como me tornar Coach FitMind.`
  );

  return (
    <div className="flex flex-col gap-4 p-4 pb-10">
      <header className="flex items-center gap-3 pt-2">
        <Link to="/student/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
          <ChevronLeft className="h-5 w-5 text-white" />
        </Link>
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider">Oportunidade</p>
          <h1 className="text-2xl font-bold text-white">Quero ser Coach</h1>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-5">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" /> Carreira FitMind
          </div>
          <h2 className="text-xl font-bold leading-tight text-white">
            Transforme sua paixão por saúde em uma carreira sem teto de ganhos.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Construa sua rede, venda produtos e serviços do ecossistema e seja premiado pelo seu crescimento.
          </p>
          <Button onClick={() => setShowInfo(true)} className="mt-4 w-full gap-2" size="lg">
            <Sparkles className="h-4 w-4" /> Entenda a oportunidade
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl p-10 text-center text-white/50" style={{ backgroundColor: "#1A1A1A" }}>
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
          Carregando...
        </div>
      ) : (
        <>
          {/* TRILHA */}
          <section className="space-y-3">
            <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-white/50">Trilha para se tornar Coach</h3>

            {/* Step 1 — Curso */}
            <article className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${courseStatus === "concluido" ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"}`}>
                  {courseStatus === "concluido" ? <CheckCircle2 className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold text-white">Curso Ativação Coach – Anual</h4>
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">Obrigatório</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/55">
                    Formação oficial FitMind com a metodologia, vendas, atendimento e bastidores da rede. Concluindo essa trilha, você está pronto para ativar sua conta de coach.
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-white/40">
                    <Clock className="h-3 w-3" />
                    <span>Acesso anual • conteúdo on-line</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={`text-[11px] font-bold uppercase ${courseStatus === "concluido" ? "text-primary" : "text-white/50"}`}>
                  {courseStatus === "concluido" ? "Concluído" : courseStatus === "em_andamento" ? "Em andamento" : "Pendente"}
                </span>
                <Button size="sm" variant={courseStatus === "concluido" ? "secondary" : "default"} onClick={startCheckout} disabled={creatingOrder} className="rounded-xl">
                  {creatingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : courseStatus === "concluido" ? "Acessar curso" : "Ativar curso"}
                </Button>
              </div>
            </article>

            {/* Step 2 — Perfil Comportamental */}
            <article className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/70">
                  <Brain className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-white">Análise de Perfil Comportamental</h4>
                  <p className="mt-1 text-xs leading-relaxed text-white/55">
                    Preencha sua análise e receba um relatório completo com os produtos e serviços que você tem mais facilidade de vender de acordo com o seu perfil.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase text-white/50">
                  {profileStatus === "concluida" ? "Concluída" : "Não iniciada"}
                </span>
                <Button size="sm" variant="default" onClick={() => setShowProfile(true)} className="rounded-xl">
                  Iniciar análise
                </Button>
              </div>
            </article>
          </section>

          {/* PITCH + COMPRA */}
          <section className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 to-transparent p-5">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
              <TrendingUp className="h-3 w-3" /> Comece agora
            </div>
            <h3 className="text-lg font-bold leading-tight text-white">
              Pronto pra ativar? Garanta hoje sua entrada como Coach FitMind.
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-white/65">
              Ativação Coach Anual: acesso completo ao curso, ao painel de coach, à sua rede e ao programa de comissões por 12 meses.
            </p>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-[10px] uppercase text-white/40">Investimento</p>
                <p className="text-2xl font-bold text-white">R$ {ACTIVATION_PRICE.toFixed(2).replace(".", ",")}</p>
                <p className="text-[10px] text-white/40">à vista no Pix</p>
              </div>
              <Button onClick={startCheckout} disabled={creatingOrder} className="gap-2" size="lg">
                {creatingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Comprar agora
              </Button>
            </div>
          </section>

          {/* COACH UPLINE */}
          {uplineCoach && (
            <section className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/50">Fale com seu coach</h3>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-full bg-white/10">
                  {uplineCoach.avatar_url ? (
                    <img src={uplineCoach.avatar_url} alt={uplineCoach.name || ""} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white/60">
                      {uplineCoach.name?.charAt(0) || "C"}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{uplineCoach.name || "Seu coach"}</p>
                  <p className="text-[11px] text-white/50">Pode te orientar e tirar dúvidas antes da decisão.</p>
                </div>
              </div>
              {waLink ? (
                <a href={waLink} target="_blank" rel="noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white">
                  <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
                </a>
              ) : (
                <p className="mt-3 text-center text-[11px] text-white/40">Contato do coach indisponível.</p>
              )}
            </section>
          )}
        </>
      )}

      {/* Modal: oportunidade */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="max-w-md border-white/10 bg-[#1A1A1A] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">Torne-se Coach FitMind</DialogTitle>
            <DialogDescription className="text-white/70">
              Construa ganhos sem teto fazendo parte do maior ecossistema de saúde, performance e estilo de vida.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed text-white/80">
            <p>
              Como Coach FitMind, você monta a sua própria rede, vende produtos e serviços do nosso ecossistema, participa de desafios premiados e é reconhecido por uma carreira estruturada de verdade.
            </p>
            <p>
              Você ganha <strong className="text-white">indicando</strong>, ganha <strong className="text-white">vendendo</strong> e ganha pelo <strong className="text-white">crescimento de quem entra com você</strong>. Tudo com a estrutura, a metodologia e a marca FitMind ao seu lado.
            </p>
            <ul className="mt-2 space-y-2">
              <li className="flex items-start gap-2"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Comissões recorrentes em vendas e assinaturas</span></li>
              <li className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Bônus pelo crescimento da sua rede</span></li>
              <li className="flex items-start gap-2"><Trophy className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Desafios mensais com premiações reais</span></li>
              <li className="flex items-start gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Plano de carreira reconhecido na marca</span></li>
            </ul>
          </div>
          <Button onClick={() => setShowInfo(false)} className="mt-2">Quero começar a trilha</Button>
        </DialogContent>
      </Dialog>

      {/* Modal: perfil comportamental (placeholder) */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="max-w-md border-white/10 bg-[#1A1A1A] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">Análise de Perfil Comportamental</DialogTitle>
            <DialogDescription className="text-white/70">
              Em breve você poderá responder o questionário direto por aqui e baixar seu relatório personalizado.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-white/70">
            Enquanto isso, fale com seu coach para receber o acesso antecipado e iniciar a análise com acompanhamento.
          </p>
          <Button onClick={() => setShowProfile(false)} variant="secondary">Fechar</Button>
        </DialogContent>
      </Dialog>

      {/* Modal: checkout */}
      <Dialog open={showCheckout} onOpenChange={(o) => { setShowCheckout(o); if (!o) setOrderId(null); }}>
        <DialogContent className="max-w-md border-white/10 bg-[#1A1A1A] text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">Ativação Coach – Anual</DialogTitle>
            <DialogDescription className="text-white/70">Pagamento via Pix.</DialogDescription>
          </DialogHeader>
          {orderId ? (
            <MercadoPagoCheckout
              source={{ kind: "store_order", id: orderId }}
              amount={orderTotal}
              description="Ativação Coach - Anual"
              defaultPayer={{ email: userEmail, name: userName }}
              initialMethod="pix"
              onApproved={() => { toast.success("Pagamento confirmado!"); setShowCheckout(false); }}
            />
          ) : (
            <div className="flex items-center justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
