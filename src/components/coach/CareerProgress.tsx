import { Plane, Check, Lock } from "lucide-react";

interface CareerProgressProps {
  currentMonths: number;
  targetMonths?: number;
  currentStudents: number;
  minStudents?: number;
  isTopSeller?: boolean;
}

export function CareerProgress({
  currentMonths,
  targetMonths = 6,
  currentStudents,
  minStudents = 100,
  isTopSeller = false,
}: CareerProgressProps) {
  const monthsPercent = Math.min((currentMonths / targetMonths) * 100, 100);
  const studentsPercent = Math.min((currentStudents / minStudents) * 100, 100);
  const qualifiesThisMonth = currentStudents >= minStudents && isTopSeller;

  return (
    <div className="rounded-2xl p-5 relative overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/5" />
      <div className="relative">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
            <Plane className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white">Plano de Carreira</h3>
            <p className="text-[11px] text-white/50">Viagem com tudo pago ao Nordeste 🌴</p>
          </div>
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
            R$ 6.000
          </span>
        </div>

        {/* Streak */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-white/70">Streak de meses qualificados</span>
            <span className="text-xs font-bold text-white">
              {currentMonths}/{targetMonths}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#252525" }}>
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${monthsPercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {Array.from({ length: targetMonths }).map((_, i) => (
              <div
                key={i}
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                  i < currentMonths ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/30"
                }`}
              >
                {i < currentMonths ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Current month requirements */}
        <div className="rounded-xl p-3 space-y-2.5" style={{ backgroundColor: "#0F0F0F" }}>
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Mês atual</p>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-white/70">Alunos ativos</span>
              <span className="text-[11px] font-bold text-white">
                {currentStudents}/{minStudents}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#252525" }}>
              <div
                className={`h-full transition-all ${currentStudents >= minStudents ? "bg-success" : "bg-primary"}`}
                style={{ width: `${studentsPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/70">Top vendedor da unidade</span>
            <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
              isTopSeller ? "bg-success/20 text-success" : "bg-white/5 text-white/40"
            }`}>
              {isTopSeller ? "✓ Sim" : "Pendente"}
            </span>
          </div>

          <div className={`mt-2 flex items-center gap-2 rounded-lg px-2.5 py-2 ${
            qualifiesThisMonth ? "bg-success/10" : "bg-white/5"
          }`}>
            {qualifiesThisMonth ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Lock className="h-4 w-4 text-white/40" />
            )}
            <span className={`text-[11px] font-medium ${qualifiesThisMonth ? "text-success" : "text-white/50"}`}>
              {qualifiesThisMonth ? "Mês qualificado!" : "Complete os requisitos para qualificar"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
