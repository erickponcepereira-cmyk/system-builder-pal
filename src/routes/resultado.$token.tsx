/**
 * Página pública de compartilhamento de resultado — /resultado/$token
 * Renderiza EXATAMENTE a mesma view de Resultado do FitMindShape,
 * envolvida por um cabeçalho com Logo + Compartilhar e um CTA de cadastro.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Share2, ChevronRight, Loader2, AlertCircle, Instagram,
  MessageCircle, UserCircle2, Award,
} from "lucide-react";
import { getAssessmentShareByToken, type PublicShareData } from "@/lib/assessment-share.functions";
import { Logo } from "@/components/Logo";
import FitMindShapeResultView from "@/components/coach/FitMindShapeResultView";
import type { FitMindClient, FitMindAssessment } from "@/components/coach/FitMindShape";

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

function toAssessment(d: PublicShareData): FitMindAssessment {
  return {
    id: d.assessmentId,
    clientId: "",
    date: d.assessmentDate,
    method: (d.method as FitMindAssessment["method"]) || "bioimpedance",
    age: d.age ?? 0,
    height: d.height ?? 0,
    weight: d.weight ?? 0,
    bmi: d.bmi ?? 0,
    bodyFat: d.bodyFat ?? 0,
    skeletalMuscle: d.skeletalMuscle ?? 0,
    muscleMass: d.muscleMass ?? 0,
    visceralFat: d.visceralFat ?? 0,
    basalMetabolism: d.basalMetabolism ?? 0,
    bodyAge: d.bodyAge ?? 0,
    bodyWater: d.bodyWater ?? 0,
    boneMass: d.boneMass ?? 0,
    segmentAnalysis: (d.segmentAnalysis as FitMindAssessment["segmentAnalysis"]) ?? undefined,
    circumferences: (d.circumferences as FitMindAssessment["circumferences"]) ?? undefined,
    systolicBP: d.systolicBP ?? undefined,
    diastolicBP: d.diastolicBP ?? undefined,
    heartRate: d.heartRate ?? undefined,
    bloodGlucose: d.bloodGlucose ?? undefined,
    clientNotes: d.clientNotes ?? undefined,
    photos: (d.photos as FitMindAssessment["photos"]) ?? undefined,
  };
}

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

  const client: FitMindClient = {
    id: "public",
    name: data.clientName,
    gender: data.clientGender,
    ethnicity: "other",
    height: data.height ?? 0,
    heightUnit: "cm",
    birthDate: "",
    language: "pt",
    whatsapp: data.clientPhone ?? "",
    email: "",
    notes: "",
    groups: [],
    assessments: data.history.map((h) => ({
      id: h.id,
      clientId: "",
      date: h.date,
      method: "bioimpedance",
      age: data.age ?? 0,
      height: data.height ?? 0,
      weight: h.weight ?? 0,
      bmi: h.bmi ?? 0,
      bodyFat: h.bodyFat ?? 0,
      skeletalMuscle: h.skeletalMuscle ?? 0,
      muscleMass: h.muscleMass ?? 0,
      visceralFat: h.visceralFat ?? 0,
      basalMetabolism: 0,
      bodyAge: h.bodyAge ?? 0,
      bodyWater: 0,
      boneMass: 0,
    })),
  };
  const assessment = toAssessment(data);

  const registerUrl = data.coachReferralCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${data.coachReferralCode}`
    : `${typeof window !== "undefined" ? window.location.origin : ""}/register?role=student`;

  const share = async () => {
    const url = window.location.href;
    const message = `Olá ${data.clientName}! Aqui está o resultado da sua avaliação corporal completa: ${url}`;
    if (data.clientPhone) {
      const cleanPhone = data.clientPhone.replace(/\D/g, "");
      const phoneWithCountry = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
      window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`, "_blank");
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: "Meu Resultado Corporal — FitMind Club", url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-8">
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

      {/* Cópia EXATA do resultado do coach */}
      <FitMindShapeResultView
        mode="public"
        client={client}
        assessment={assessment}
        allAssessments={client.assessments}
        coach={{
          name: data.coachName,
          logo: data.coachAvatar,
          specialty: data.coachSpecialty,
          email: data.coachEmail,
        }}
        themeColor="#dc2626"
      />

      <div className="mx-auto max-w-lg px-4 pt-2 space-y-5">
        {/* Coach card */}
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

        {/* CTA */}
        <div className="rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 p-6 text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20">
            <Award className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-white">Transforme seu resultado em realidade</h2>
          <p className="text-sm text-white/60">
            Acesse o FitMind Club, acompanhe sua evolução, treinos personalizados e muito mais — com seu coach.
          </p>
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

        <div className="text-center pt-2 pb-4">
          <Logo className="mx-auto h-8 w-8 object-contain opacity-40 mb-2" />
          <p className="text-[11px] text-white/25">
            FitMind Club · Conectando corpo e mente para uma versão melhor
          </p>
        </div>
      </div>
    </div>
  );
}
