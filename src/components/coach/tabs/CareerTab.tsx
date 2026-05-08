import { PatentBadge } from "@/components/coach/PatentBadge";
import { CareerProgress } from "@/components/coach/CareerProgress";

export function CareerTab() {
  const allPatents: { p: import("@/components/coach/PatentBadge").PatentLevel; req: string; current?: boolean; achieved?: boolean }[] = [
    { p: "coach", req: "Cadastro aprovado", achieved: true },
    { p: "senior_coach", req: "10+ alunos diretos", current: true, achieved: true },
    { p: "manager", req: "30+ alunos + 3 coaches" },
    { p: "senior_manager", req: "60+ alunos + 5 managers" },
    { p: "director", req: "100+ alunos + 10 managers" },
    { p: "senior_director", req: "200+ alunos + 3 directors" },
    { p: "master_director", req: "500+ alunos + 5 directors" },
  ];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Plano de Carreira</h1>
        <p className="text-sm text-white/50">Sua jornada na FitMind Club</p>
      </div>

      <CareerProgress currentMonths={3} currentStudents={24} isTopSeller={false} />

      <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white mb-4">Sistema de Patentes</h3>
        <div className="space-y-2">
          {allPatents.map((item) => (
            <div
              key={item.p}
              className={`flex items-center gap-3 rounded-xl p-3 ${
                item.current ? "ring-1 ring-primary/40" : ""
              }`}
              style={{ backgroundColor: item.current ? "rgba(255,66,48,0.06)" : "#0F0F0F" }}
            >
              <PatentBadge patent={item.p} size="md" showName={false} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <PatentBadge patent={item.p} size="sm" showName={true} />
                  {item.current && (
                    <span className="text-[9px] font-bold rounded-full bg-primary/20 px-2 py-0.5 text-primary">
                      ATUAL
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/50 mt-0.5">{item.req}</p>
              </div>
              {item.achieved && (
                <span className="text-[10px] font-bold text-success">✓</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default CareerTab;
