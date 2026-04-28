import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Apple, BadgePercent, BookOpen, Check, Copy, Dumbbell, Gift, HeartPulse, ShoppingBag, Sparkles, Star, Ticket, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/benefits")({
  component: BenefitsPage,
});

type Benefit = { id: string; name: string; description: string | null; discount_info: string | null; coupon_code: string | null; website_url: string | null; category: string | null };
type ShopItem = { id: string; title: string; price: number; originalPrice: number | null; type: "digital" | "physical"; category: string | null; tag?: string };

type StudentCard = { name: string; email: string; activePlan: string; referralLink: string; available: number; pending: number; attendance: number };

const unlocks = [
  { icon: BadgePercent, title: "Cupons parceiros", desc: "Descontos liberados para alunos ativos.", tag: "Ativo" },
  { icon: Dumbbell, title: "Aulas especiais", desc: "Treinos bônus, lives e replays do desafio.", tag: "Premium" },
  { icon: Apple, title: "Nutrição prática", desc: "Receitas, listas e orientações semanais.", tag: "Semanal" },
  { icon: HeartPulse, title: "Check-ins", desc: "Pesagem, evolução e alertas para seu coach.", tag: "Coach" },
];

function BenefitsPage() {
  const [card, setCard] = useState<StudentCard>({ name: "Aluno FitMind", email: "", activePlan: "FitMind Club", referralLink: "/r/FITMIND", available: 0, pending: 0, attendance: 0 });
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [shop, setShop] = useState<ShopItem[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<Benefit | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      let studentId: string | null = null;
      if (userData.user) {
        const { data: profile } = await supabase.from("profiles").select("id,name,email").eq("user_id", userData.user.id).maybeSingle();
        const { data: student } = profile?.id ? await supabase.from("students").select("id,referral_link,referral_code").eq("profile_id", profile.id).maybeSingle() : { data: null };
        studentId = student?.id || null;
        const [{ data: wallet }, { data: sub }, { count }] = await Promise.all([
          studentId ? supabase.from("student_wallets").select("available_balance,pending_balance").eq("student_id", studentId).maybeSingle() : Promise.resolve({ data: null }),
          studentId ? supabase.from("subscriptions").select("products(name)").eq("student_id", studentId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
          studentId ? supabase.from("attendance_logs").select("id", { count: "exact", head: true }).eq("student_id", studentId) : Promise.resolve({ count: 0 }),
        ]);
        setCard({
          name: profile?.name || "Aluno FitMind",
          email: profile?.email || "",
          activePlan: ((sub as unknown as { products?: { name?: string } })?.products?.name) || "FitMind Club ativo",
          referralLink: student?.referral_link || `/r/${student?.referral_code || "FITMIND"}`,
          available: Number(wallet?.available_balance || 0),
          pending: Number(wallet?.pending_balance || 0),
          attendance: Math.min(100, Math.round(((count || 0) / 20) * 100)),
        });
      }

      const [benefitRes, digitalRes, physicalRes] = await Promise.all([
        supabase.from("partner_benefits").select("id,name,description,discount_info,coupon_code,website_url,category").eq("is_active", true).order("sort_order"),
        supabase.from("digital_products").select("id,title,price,original_price,type,is_featured,status").eq("status", "active").order("sort_order").limit(4),
        supabase.from("store_products").select("id,name,price,original_price,category,is_herbalife,status").eq("status", "active").order("sort_order").limit(4),
      ]);
      setBenefits((benefitRes.data as Benefit[]) || []);
      setShop([
        ...((digitalRes.data || []).map((item) => ({ id: item.id, title: item.title, price: Number(item.price || 0), originalPrice: item.original_price ? Number(item.original_price) : null, type: "digital" as const, category: item.type, tag: item.is_featured ? "Destaque" : "Curso" }))),
        ...((physicalRes.data || []).map((item) => ({ id: item.id, title: item.name, price: Number(item.price || 0), originalPrice: item.original_price ? Number(item.original_price) : null, type: "physical" as const, category: item.category, tag: item.is_herbalife ? "Herbalife" : "Loja" }))),
      ]);
    })();
  }, []);

  const nextUnlock = useMemo(() => card.attendance >= 100 ? "Todos os benefícios de frequência liberados." : `Complete ${Math.max(0, 20 - Math.round((card.attendance / 100) * 20))} check-ins para liberar novos descontos.`, [card.attendance]);
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const copy = async (text?: string | null) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Clube</p>
        <h1 className="text-2xl font-bold text-foreground">Benefícios</h1>
      </header>

      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/10 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Gift className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-foreground">{card.activePlan}</p>
            <p className="mt-1 truncate text-sm text-muted-foreground">{card.name} · {card.email}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Metric label="Frequência" value={`${card.attendance}%`} />
              <Metric label="Carteira" value={fmt(card.available)} />
              <Metric label="Pendente" value={fmt(card.pending)} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-primary"><Wallet className="h-4 w-4" /><p className="text-xs font-bold uppercase tracking-wider">Carteirinha FitMind</p></div>
          <button onClick={() => copy(card.referralLink)} className="text-xs font-bold text-primary">Copiar indicação</button>
        </div>
        <div className="mt-3 rounded-xl bg-white/5 px-3 py-2 font-mono text-xs text-white/60">{card.referralLink}</div>
      </section>

      <div className="grid gap-3">
        {unlocks.map((benefit) => (
          <article key={benefit.title} className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15"><benefit.icon className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-white">{benefit.title}</h2><span className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-primary">{benefit.tag}</span></div>
                <p className="mt-1 text-xs leading-relaxed text-white/50">{benefit.desc}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-primary"><Ticket className="h-4 w-4" /><h2 className="text-sm font-bold text-white">Cupons e parceiros</h2></div><span className="text-[10px] text-white/35">{benefits.length} ativos</span></div>
        {benefits.length === 0 ? <p className="text-xs text-white/45">Novos parceiros serão exibidos aqui.</p> : (
          <div className="grid gap-2">
            {benefits.map((benefit) => (
              <button key={benefit.id} onClick={() => setSelectedCoupon(benefit)} className="rounded-xl bg-white/5 px-3 py-3 text-left transition-colors hover:bg-white/10">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-white">{benefit.name}</p><span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{benefit.discount_info || "benefício"}</span></div>
                <p className="mt-1 line-clamp-2 text-xs text-white/45">{benefit.description || benefit.category || "Cupom exclusivo FitMind Club"}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-primary"><ShoppingBag className="h-4 w-4" /><h2 className="text-sm font-bold text-white">Loja no Clube</h2></div><Link to="/student/store" className="text-xs font-bold text-primary">Ver loja</Link></div>
        <div className="grid grid-cols-2 gap-2">
          {shop.slice(0, 4).map((item) => (
            <Link key={`${item.type}-${item.id}`} to="/student/store" className="rounded-xl bg-white/5 p-3">
              <div className="mb-2 flex h-12 items-center justify-center rounded-lg bg-white/5">{item.type === "digital" ? <BookOpen className="h-5 w-5 text-primary" /> : <ShoppingBag className="h-5 w-5 text-primary" />}</div>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold text-primary">{item.tag}</span>
              <p className="mt-1 min-h-8 text-xs font-bold text-white line-clamp-2">{item.title}</p>
              <p className="text-xs text-white/55">{fmt(item.price)}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20"><Sparkles className="h-5 w-5 text-emerald-300" /></div><div><p className="text-sm font-bold text-white">Portal Herbalife</p><p className="mt-1 text-xs text-white/55">Produtos Herbalife aparecem na loja com identificação própria e podem receber cupom exclusivo.</p><Link to="/student/store" className="mt-3 inline-flex rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Acessar produtos</Link></div></div>
      </section>

      <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center gap-2 text-primary"><Star className="h-4 w-4" /><p className="text-xs font-bold uppercase tracking-wider">Próximo desbloqueio</p></div>
        <p className="mt-2 text-sm text-white">{nextUnlock}</p>
      </section>

      {selectedCoupon && (
        <div className="fixed inset-0 z-50 flex items-end bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15"><Ticket className="h-5 w-5 text-primary" /></div><div className="flex-1"><h2 className="text-base font-bold text-foreground">{selectedCoupon.name}</h2><p className="text-xs text-muted-foreground">{selectedCoupon.description}</p></div></div>
            <div className="rounded-xl bg-muted p-3 text-center"><p className="text-[10px] font-bold uppercase text-muted-foreground">Cupom</p><p className="mt-1 font-mono text-lg font-bold text-foreground">{selectedCoupon.coupon_code || "FITMIND"}</p></div>
            <div className="mt-4 flex gap-2"><button onClick={() => setSelectedCoupon(null)} className="flex-1 rounded-xl bg-muted px-4 py-3 text-sm font-bold text-foreground">Fechar</button><button onClick={() => copy(selectedCoupon.coupon_code || "FITMIND")} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Copy className="h-4 w-4" /> Copiar</button></div>
            {selectedCoupon.website_url && <a href={selectedCoupon.website_url} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm font-bold text-foreground"><Check className="h-4 w-4" /> Abrir parceiro</a>}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-primary-foreground/10 px-2 py-2 text-center"><p className="truncate text-[9px] text-primary-foreground/70">{label}</p><p className="truncate text-xs font-bold text-primary-foreground">{value}</p></div>;
}
