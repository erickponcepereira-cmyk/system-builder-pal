import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, ArrowLeft, Activity, Utensils, Droplet, Flame, Heart, FileText, AlertTriangle, Stethoscope, Apple } from "lucide-react";

export const Route = createFileRoute("/student/protocol")({
  head: () => ({
    meta: [
      { title: "Meu Protocolo — FitMind Club" },
      { name: "description", content: "Acompanhe o protocolo passado pelo seu coach: dieta, treinos, metas e ficha de saúde." },
    ],
  }),
  component: StudentProtocolPage,
});

function StudentProtocolPage() {
  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="flex items-center gap-3 pt-2">
        <Link to="/student" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
          <ArrowLeft className="h-4 w-4 text-white/70" />
        </Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">Saúde e treino</p>
          <h1 className="text-2xl font-bold text-white">Meu Protocolo</h1>
        </div>
      </header>

      {/* Aviso "em construção" */}
      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
        <div className="mb-2 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Em ativação</p>
        </div>
        <p className="text-sm text-white/80">
          Após a anamnese e a bioimpedância, seu coach vai liberar aqui o protocolo completo com dieta, treino, calorias e meta de água.
        </p>
      </div>

      {/* Metas diárias (placeholders até o coach preencher) */}
      <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h2 className="mb-3 text-sm font-bold text-white">Metas diárias</h2>
        <div className="grid grid-cols-2 gap-2">
          <MetaCard icon={Flame} label="Calorias / dia" value="—" hint="A definir" />
          <MetaCard icon={Droplet} label="Água / dia" value="—" hint="A definir" />
        </div>
      </section>

      {/* Protocolos */}
      <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h2 className="mb-3 text-sm font-bold text-white">Protocolo do coach</h2>
        <div className="space-y-2">
          <ProtocolItem icon={Utensils} title="Plano alimentar" desc="Aguardando o coach liberar sua dieta" />
          <ProtocolItem icon={Activity} title="Treino prescrito" desc="Aguardando o coach liberar seus exercícios" />
        </div>
      </section>

      {/* Atalhos para fichas profissionais */}
      <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h2 className="mb-3 text-sm font-bold text-white">Documentos profissionais</h2>
        <div className="space-y-2">
          <ShortcutItem icon={FileText} title="Anamnese" desc="Histórico inicial preenchido com o coach" />
          <ShortcutItem icon={Activity} title="Bioimpedância" desc="Última avaliação corporal" />
          <ShortcutItem icon={Apple} title="Dieta do nutricionista" desc="Plano profissional vinculado" />
          <ShortcutItem icon={Stethoscope} title="Acompanhamento médico" desc="Receitas, exames e medicações" />
        </div>
      </section>

      {/* Ficha de saúde */}
      <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h2 className="mb-1 text-sm font-bold text-white">Ficha de saúde</h2>
        <p className="mb-3 text-[11px] text-white/40">Dados clínicos importantes para garantir treinos seguros</p>
        <div className="grid grid-cols-2 gap-2">
          <InfoCard icon={Heart} label="Tipo sanguíneo" value="—" />
          <InfoCard icon={AlertTriangle} label="Alergias" value="—" />
          <InfoCard icon={Stethoscope} label="Cirurgias" value="—" />
          <InfoCard icon={Activity} label="Restrições físicas" value="—" />
          <InfoCard icon={Heart} label="Condições crônicas" value="—" />
          <InfoCard icon={ClipboardList} label="Medicações" value="—" />
        </div>
        <p className="mt-3 text-[11px] text-white/40">
          Em breve você poderá preencher e atualizar essas informações junto ao seu coach.
        </p>
      </section>
    </div>
  );
}

function MetaCard({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] text-white/40">{hint}</p>
    </div>
  );
}

function ProtocolItem({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-[11px] text-white/40">{desc}</p>
      </div>
    </div>
  );
}

function ShortcutItem({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-3 text-left transition-colors hover:bg-white/[0.08]">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-[11px] text-white/40">{desc}</p>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">Em breve</span>
    </button>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      </div>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
