import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Flame, QrCode, Calendar, Camera, Apple, Scale, Trophy, Sparkles, Quote, Link as LinkIcon, Copy, Share2, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/")({
  component: StudentHome,
});

function StudentHome() {
  const [studentName, setStudentName] = useState("Aluno");
  const [referralLink, setReferralLink] = useState("/r/ALUNO2026");
  const [availableBalance, setAvailableBalance] = useState(0);
  const [showReferral, setShowReferral] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id,name")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (profile?.name) setStudentName(profile.name.split(" ")[0]);
      if (!profile?.id) return;

      const { data: student } = await supabase
        .from("students")
        .select("id,referral_link,referral_code")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (!student?.id) return;
      setReferralLink(student.referral_link || `/r/${student.referral_code || "ALUNO2026"}`);

      const { data: wallet } = await supabase
        .from("student_wallets")
        .select("available_balance")
        .eq("student_id", student.id)
        .maybeSingle();
      setAvailableBalance(Number(wallet?.available_balance || 0));
    })();
  }, []);

  const copyReferral = async () => {
    await navigator.clipboard.writeText(referralLink);
    toast.success("Link copiado!");
  };

  const shareReferral = async () => {
    const text = `Entre no FitMind Club pelo meu link: ${referralLink}`;
    if (navigator.share) await navigator.share({ title: "FitMind Club", text, url: referralLink });
    else {
      await navigator.clipboard.writeText(text);
      toast.success("Texto copiado para compartilhar!");
    }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Entre no FitMind Club pelo meu link: ${referralLink}`)}`;

  return (
    <div className="flex flex-col gap-5 p-4 pb-6">
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 ring-2 ring-primary/30">
            <span className="text-base font-bold text-primary">{studentName.charAt(0)}</span>
          </div>
          <div>
            <p className="text-xs text-white/40">Bom dia,</p>
            <p className="text-sm font-bold text-white">{studentName} 🔥</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowReferral(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
            <LinkIcon className="h-5 w-5 text-primary" />
          </button>
          <button className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
            <Bell className="h-5 w-5 text-white/70" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
          </button>
        </div>
      </header>

      <div className="rounded-2xl border-l-4 border-primary p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex gap-3">
          <Quote className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm leading-relaxed text-white/80">“Seu único competidor é a versão de ontem de você mesmo.”</p>
            <p className="mt-1 text-[11px] text-white/40">— FitMind Club</p>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl p-5" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))" }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-black/10" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <div className="mb-3 flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-white" />
              <span className="text-xs font-bold tracking-wider text-white">FITMIND CLUB</span>
            </div>
            <p className="text-[11px] uppercase tracking-wider text-white/70">Carteirinha Digital</p>
            <p className="mt-0.5 text-lg font-bold text-white">Desafio 30 Dias</p>
            <p className="mt-2 text-xs text-white/80">Plano Premium • Ativo</p>
            <p className="mt-1 text-[10px] text-white/60">Válido até 15/05/2026</p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/95">
            <QrCode className="h-9 w-9 text-black" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">💰 Indique e Ganhe!</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/70">Compartilhe seu link e ganhe comissão por cada amigo inscrito.</p>
            <p className="mt-2 text-[11px] font-semibold text-primary">Você já ganhou R$ {availableBalance.toFixed(2).replace(".", ",")}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <LinkIcon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={copyReferral} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
            <Copy className="h-3.5 w-3.5" /> Copiar Link
          </button>
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white">
            <Share2 className="h-3.5 w-3.5" /> WhatsApp
          </a>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-white">Progresso do Desafio</h2>
          </div>
          <span className="text-xs font-bold text-primary">Dia 18/30</span>
        </div>
        <Progress value={60} className="h-2 bg-white/5" />
        <div className="mt-3 flex justify-between text-[11px] text-white/50">
          <span>60% concluído</span>
          <span>12 dias restantes</span>
        </div>
      </div>

      <Link to="/student/challenge" className="flex items-center gap-3 rounded-2xl p-4 transition-colors hover:bg-white/[0.07]" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
          <Calendar className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] uppercase tracking-wide text-white/40">Próxima Aula</p>
          <p className="text-sm font-semibold text-white">HIIT — Queima Total</p>
          <p className="text-xs text-white/50">Hoje • 19h00 • Ao vivo</p>
        </div>
        <span className="rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-bold text-primary">AO VIVO</span>
      </Link>

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">Ações Rápidas</h2>
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Camera, label: "Foto", to: "/student/evolution" },
            { icon: Apple, label: "Refeição", to: "/student/evolution" },
            { icon: Scale, label: "Pesagem", to: "/student/challenge" },
            { icon: Sparkles, label: "IA", to: "/student/evolution" },
          ].map((a) => (
            <Link key={a.label} to={a.to} className="flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 transition-colors hover:bg-white/[0.07]" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <a.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="text-[10px] font-medium text-white/70">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-lg font-bold text-white">-3.2</p>
          <p className="mt-0.5 text-[10px] text-white/40">kg perdidos</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-lg font-bold text-white">14</p>
          <p className="mt-0.5 text-[10px] text-white/40">aulas feitas</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-lg font-bold text-primary">A+</p>
          <p className="mt-0.5 text-[10px] text-white/40">consistência</p>
        </div>
      </div>

      {showReferral && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-3xl border border-white/10 bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Indique e Ganhe</h2>
                <p className="text-sm text-white/60">Compartilhe seu link único com amigos.</p>
              </div>
              <button onClick={() => setShowReferral(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
            <div className="mb-4 flex justify-center">
              <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-white">
                <QrCode className="h-24 w-24 text-black" />
              </div>
            </div>
            <div className="mb-3 rounded-xl bg-white/5 px-3 py-2 font-mono text-xs text-white/70">{referralLink}</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={copyReferral} className="rounded-xl bg-primary px-3 py-3 text-xs font-bold text-primary-foreground">Copiar link</button>
              <button onClick={shareReferral} className="rounded-xl bg-white/10 px-3 py-3 text-xs font-bold text-white">Compartilhar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
