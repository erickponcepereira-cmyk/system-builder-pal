/**
 * src/routes/resultado.$token.tsx
 *
 * Página pública de compartilhamento de resultado de avaliação corporal.
 * Acessível sem login: /resultado/{token}
 *
 * Fluxo:
 *  1. Coach gera link → /resultado/abc123xyz
 *  2. Envia para o cliente (WhatsApp, e-mail, etc.)
 *  3. Cliente abre a página, vê seu resultado e o card do coach
 *  4. Botão CTA → /r/{referralCode} → /register?role=student (com coach vinculado)
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, Award, Brain, Droplets, Flame, Heart, Scale,
  Share2, ChevronRight, Loader2, AlertCircle, Instagram,
  MessageCircle, UserCircle2, Dumbbell,
} from "lucide-react";
import { getAssessmentShareByToken, type PublicShareData } from "@/lib/assessment-share.functions";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/resultado/$token")({
  head: () => ({
    meta: [
      { title: "Meu Resultado Corporal — FitMind Club" },
      { name: "description", content: "Veja sua avaliação corporal completa e comece sua transformação com o FitMind Club." },
      { property: "og:title", content: "Meu Resultado Corporal — FitMind Club" },
      { property: "og:description", content: "Avaliação corporal completa. Gordura, músculo, metabolismo e muito mais." },
    ],
  }),
  component: ResultadoPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt1 = (v: number | null) => (v != null ? v.toFixed(1) : "—");
const fmtInt = (v: number | null) => (v != null ? Math.round(v).toString() : "—");

function avatarIndex(bodyFat: number | null, gender = "female"): number {
  if (bodyFat == null) return 1;
  const f = gender === "male"
    ? [5, 15, 20, 25, 30, 35, 40, 999]
    : [13, 22, 27, 32, 37, 42, 47, 999];
  return f.findIndex((max) => bodyFat <= max);
}

const AVATAR_LABELS = ["Abaixo", "Normal", "Acima 1", "Acima 2", "Acima 3", "Alto 1", "Alto 2", "Alto 3"];
const AVATAR_COLORS = ["#60a5fa", "#22c55e", "#a3e635", "#facc15", "#fb923c", "#f87171", "#ef4444", "#b91c1c"];

// ── Main component ───────────────────────────────────────────────────────────

function ResultadoPage() {
  const { token } = Route.useParams();
  const fetchShare = useServerFn(getAssessmentShareByToken);
  const [data, setData] = useState<PublicShareData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    fetchShare({ data: { token } })
      .then((r) => { setData(r); setStatus("ok"); })
      .catch(() => setStatus("error"));
  }, [token]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-white/50">Carregando resultado...</p>
        </div>
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] px-4">
        <div className="w-full max-w-sm rounded-2xl bg-[#1A1A1A] p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h1 className="text-lg font-bold text-white">Link não encontrado</h1>
          <p className="mt-2 text-sm text-white/50">
            Este link pode ter expirado ou não existe. Solicite um novo ao seu coach.
          </p>
          <a href="/register?role=student" className="mt-5 block w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white text-center">
            Criar minha conta
          </a>
        </div>
      </div>
    );
  }

  const ai = avatarIndex(data.bodyFat);
  const avatarColor = AVATAR_COLORS[ai] ?? "#22c55e";
  const avatarLabel = AVATAR_LABELS[ai] ?? "Normal";
  const date = new Date(data.assessmentDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const registerUrl = data.coachReferralCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${data.coachReferralCode}`
    : `${typeof window !== "undefined" ? window.location.origin : ""}/register?role=student`;

  const share = async () => {
    const url = window.location.href;
    const message = `Olá ${data.clientName}! Aqui está o resultado da sua avaliação corporal completa: ${url}`;
    // If client has phone, open WhatsApp directly to them
    if (data.clientPhone) {
      const cleanPhone = data.clientPhone.replace(/\D/g, "");
      const phoneWithCountry = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
      window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`, "_blank");
      return;
    }
    // Fallback to native share / clipboard
    if (navigator.share) {
      await navigator.share({ title: "Meu Resultado Corporal — FitMind Club", url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-8">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-[#0A0A0A]/90 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-8 object-contain" />
          <span className="text-sm font-bold text-white">FitMind Club</span>
        </div>
        <button
          onClick={share}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white"
        >
          <Share2 className="h-3.5 w-3.5" /> Compartilhar
        </button>
      </header>

      <div className="mx-auto max-w-lg px-4 pt-6 space-y-5">

        {/* ── Hero card ── */}
        <div
          className="relative overflow-hidden rounded-3xl p-6 text-center"
          style={{ background: `linear-gradient(135deg, ${avatarColor}22 0%, #1A1A1A 60%)`, border: `1.5px solid ${avatarColor}44` }}
        >
          {/* Glow */}
          <div
            className="absolute inset-0 opacity-10 blur-3xl"
            style={{ background: avatarColor, borderRadius: "50%" }}
          />

          <p className="relative text-[11px] font-bold uppercase tracking-widest text-white/50 mb-2">
            {date} · {data.method === "measurements" ? "Medidas" : "Bioimpedância"}
          </p>
          <h1 className="relative text-2xl font-bold text-white">
            Olá, <span style={{ color: avatarColor }}>{data.clientName}</span>! 👋
          </h1>
          <p className="relative mt-1 text-sm text-white/60">
            Aqui está o resultado completo da sua avaliação corporal.
          </p>

          {/* Avatar indicator */}
          <div className="relative mx-auto mt-5 inline-flex flex-col items-center gap-2">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full text-4xl shadow-lg"
              style={{ background: `${avatarColor}22`, border: `3px solid ${avatarColor}` }}
            >
              {ai <= 1 ? "💪" : ai <= 3 ? "⚡" : ai <= 5 ? "🔥" : "⚠️"}
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-bold text-white"
              style={{ background: avatarColor }}
            >
              {avatarLabel}
            </span>
          </div>

          {/* Quick stats */}
          <div className="relative mt-5 grid grid-cols-3 gap-3">
            {[
              { icon: Scale, label: "Peso", value: `${fmt1(data.weight)} kg` },
              { icon: Activity, label: "IMC", value: fmt1(data.bmi) },
              { icon: Flame, label: "% Gordura", value: `${fmt1(data.bodyFat)}%` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl bg-white/5 p-3">
                <Icon className="mx-auto h-4 w-4 text-white/40 mb-1" />
                <p className="text-[10px] text-white/50">{label}</p>
                <p className="text-base font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Composição Corporal ── */}
        <Section title="🏋️ Composição Corporal">
          <MetricRow icon={Dumbbell} label="Músculo Esquelético" value={`${fmt1(data.skeletalMuscle)}%`} sub="Referência: 24–30% (fem.) / 33–39% (masc.)" />
          <MetricRow icon={Award} label="Massa Muscular" value={`${fmt1(data.muscleMass)}%`} />
          <MetricRow icon={Droplets} label="Água Corporal" value={`${fmt1(data.bodyWater)}%`} sub="Referência: 45–65%" />
          <MetricRow icon={Activity} label="Massa Óssea" value={`${fmt1(data.boneMass)}%`} />
        </Section>

        {/* ── Diagnóstico de Obesidade ── */}
        <Section title="📊 Diagnóstico de Obesidade">
          <MetricRow icon={Scale} label="IMC" value={`${fmt1(data.bmi)} kg/m²`} sub="Ref: 18,5–24,9 kg/m²" highlight={bmiColor(data.bmi)} />
          <MetricRow icon={Flame} label="Gordura Corporal" value={`${fmt1(data.bodyFat)}%`} sub="Ref: 13–22% (fem.) / 5–15% (masc.)" highlight={fatColor(data.bodyFat)} />
          {data.visceralFat != null && data.visceralFat > 0 && (
            <MetricRow icon={AlertCircle} label="Gordura Visceral" value={fmtInt(data.visceralFat)} sub="Ref: 1–9" highlight={data.visceralFat > 9 ? "#f87171" : "#22c55e"} />
          )}
          <MetricRow icon={Flame} label="Metabolismo Basal" value={`${fmtInt(data.basalMetabolism)} kcal/dia`} />
        </Section>

        {/* ── Outros Indicadores ── */}
        <Section title="❤️ Outros Indicadores">
          <MetricRow icon={Brain} label="Idade Corporal" value={data.bodyAge ? `${data.bodyAge} anos` : "—"} sub={data.age ? `Idade real: ${data.age} anos` : undefined} highlight={data.bodyAge && data.age && data.bodyAge > data.age ? "#f87171" : "#22c55e"} />
          {data.systolicBP && (
            <MetricRow icon={Heart} label="Pressão Arterial" value={`${data.systolicBP}/${data.diastolicBP} mmHg`} sub="Ref: 120/80 mmHg" />
          )}
          {data.heartRate && (
            <MetricRow icon={Heart} label="Frequência Cardíaca" value={`${data.heartRate} bpm`} sub="Ref: 60–100 bpm" />
          )}
          {data.bloodGlucose && (
            <MetricRow icon={Activity} label="Glicemia" value={`${data.bloodGlucose} mg/dL`} sub="Ref: 70–99 mg/dL (jejum)" />
          )}
        </Section>

        {/* ── Coach card ── */}
        <div className="rounded-3xl border border-white/10 bg-[#1A1A1A] p-5">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-white/40">Avaliado por</p>
          <div className="flex items-center gap-4">
            {data.coachAvatar ? (
              <img src={data.coachAvatar} alt={data.coachName} className="h-14 w-14 rounded-full object-cover border-2 border-primary/30" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
                <UserCircle2 className="h-8 w-8 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white truncate">{data.coachName}</p>
              {data.coachSpecialty && (
                <p className="text-xs text-white/50 mt-0.5 truncate">{data.coachSpecialty}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                {data.coachWhatsapp && (
                  <a
                    href={`https://wa.me/55${data.coachWhatsapp.replace(/\D/g, "")}?text=Oi! Vi meu resultado no FitMind Club e quero saber mais.`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-full bg-[#25D366]/15 px-2.5 py-1 text-[10px] font-bold text-[#25D366]"
                  >
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </a>
                )}
                {data.coachInstagram && (
                  <a
                    href={`https://instagram.com/${data.coachInstagram.replace("@", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-full bg-pink-500/15 px-2.5 py-1 text-[10px] font-bold text-pink-400"
                  >
                    <Instagram className="h-3 w-3" /> Instagram
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 p-6 text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20">
            <Award className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-white">Transforme seu resultado em realidade</h2>
          <p className="text-sm text-white/60">
            Acesse o FitMind Club, acompanhe sua evolução, treinos personalizados e muito mais — com seu coach.
          </p>
          <ul className="text-left space-y-2 my-4">
            {[
              "📈 Histórico completo de avaliações",
              "🏋️ Protocolos de treino personalizados",
              "🥗 Orientação nutricional do seu coach",
              "🎯 Desafios e metas de transformação",
              "📱 App exclusivo FitMind Club",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-white/70">
                <span className="shrink-0">{item.slice(0, 2)}</span>
                <span>{item.slice(2)}</span>
              </li>
            ))}
          </ul>
          <a
            href={registerUrl}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors"
          >
            Inscreva-se no FitMind Club
            <ChevronRight className="h-5 w-5" />
          </a>
          <p className="text-[11px] text-white/30">
            Você ficará vinculado ao coach{" "}
            <span className="text-white/50 font-semibold">{data.coachName}</span>
          </p>
        </div>

        {/* Footer */}
        <div className="text-center pt-2 pb-4">
          <Logo className="mx-auto h-8 w-8 object-contain opacity-40 mb-2" />
          <p className="text-[11px] text-white/25">
            FitMind Club · Conectando corpo e mente para sua melhor versão
          </p>
          <p className="text-[10px] text-white/20 mt-1">
            Resultado gerado em {date}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-[#1A1A1A] border border-white/5 p-5 space-y-1">
      <p className="text-sm font-bold text-white mb-3">{title}</p>
      {children}
    </div>
  );
}

function MetricRow({
  icon: Icon, label, value, sub, highlight,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
  highlight?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
          <Icon className="h-3.5 w-3.5 text-white/40" />
        </div>
        <div>
          <p className="text-sm text-white/80">{label}</p>
          {sub && <p className="text-[10px] text-white/35 mt-0.5">{sub}</p>}
        </div>
      </div>
      <span
        className="text-sm font-bold"
        style={{ color: highlight || "#ffffff" }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function bmiColor(bmi: number | null): string {
  if (!bmi) return "#ffffff";
  if (bmi < 18.5) return "#60a5fa";
  if (bmi <= 24.9) return "#22c55e";
  if (bmi <= 29.9) return "#facc15";
  return "#f87171";
}

function fatColor(fat: number | null): string {
  if (!fat) return "#ffffff";
  if (fat < 13) return "#60a5fa";
  if (fat <= 22) return "#22c55e";
  if (fat <= 32) return "#facc15";
  return "#f87171";
}
