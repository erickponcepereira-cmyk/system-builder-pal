import { useMemo, useState } from "react";
import { Activity, ClipboardList, Save, Scale, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type EvaluationType = "initial" | "midpoint" | "final";

function classifyBmi(bmi: number) {
  if (!bmi) return { label: "—", risk: "Informe peso e altura" };
  if (bmi < 18.5) return { label: "Baixo peso", risk: "Atenção para déficit nutricional" };
  if (bmi < 25) return { label: "Normal", risk: "Faixa saudável" };
  if (bmi < 30) return { label: "Sobrepeso", risk: "Risco moderado" };
  if (bmi < 35) return { label: "Obesidade I", risk: "Risco aumentado" };
  if (bmi < 40) return { label: "Obesidade II", risk: "Risco alto" };
  return { label: "Obesidade III", risk: "Risco muito alto" };
}

function classifyFat(value: number) {
  if (!value) return "—";
  if (value < 18) return "baixo";
  if (value < 25) return "normal";
  if (value < 32) return "alto";
  return "muito alto";
}

function classifyMuscle(value: number) {
  if (!value) return "—";
  if (value < 28) return "baixo";
  if (value < 38) return "normal";
  return "alto";
}

function classifyVisceral(value: number) {
  if (!value) return "—";
  if (value <= 9) return "normal";
  if (value <= 14) return "alto";
  return "muito alto";
}

export function StudentEvaluationPanel() {
  const [evaluationType, setEvaluationType] = useState<EvaluationType>("initial");
  const [weight, setWeight] = useState("82.5");
  const [height, setHeight] = useState("170");
  const [fat, setFat] = useState("31.2");
  const [muscle, setMuscle] = useState("32.4");
  const [visceral, setVisceral] = useState("11");

  const bmi = useMemo(() => {
    const weightValue = Number(weight.replace(",", "."));
    const heightValue = Number(height.replace(",", ".")) / 100;
    if (!weightValue || !heightValue) return 0;
    return Number((weightValue / (heightValue * heightValue)).toFixed(2));
  }, [height, weight]);

  const bmiClass = classifyBmi(bmi);
  const fatClass = classifyFat(Number(fat.replace(",", ".")));
  const muscleClass = classifyMuscle(Number(muscle.replace(",", ".")));
  const visceralClass = classifyVisceral(Number(visceral));

  const fields = [
    { label: "Peso (kg)", value: weight, setValue: setWeight, icon: Scale },
    { label: "Altura (cm)", value: height, setValue: setHeight, icon: UserRound },
    { label: "% Gordura", value: fat, setValue: setFat, icon: Activity },
    { label: "% Músculos", value: muscle, setValue: setMuscle, icon: Activity },
    { label: "Gordura visceral", value: visceral, setValue: setVisceral, icon: Activity },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Avaliar Aluno</h2>
            <p className="text-sm text-white/50">Bioimpedância com classificação em tempo real</p>
          </div>
          <ClipboardList className="h-6 w-6 text-primary" />
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {([
            ["initial", "Inicial"],
            ["midpoint", "Parcial"],
            ["final", "Final"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setEvaluationType(value)}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                evaluationType === value ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <div key={field.label} className="space-y-2">
              <Label className="text-white/60">{field.label}</Label>
              <div className="relative">
                <field.icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <Input
                  value={field.value}
                  onChange={(event) => field.setValue(event.target.value)}
                  className="border-white/10 bg-white/5 pl-9 text-white"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "IMC", value: bmi || "—", detail: bmiClass.label, extra: bmiClass.risk },
          { label: "Gordura", value: fat ? `${fat}%` : "—", detail: fatClass, extra: "Classificação automática" },
          { label: "Músculos", value: muscle ? `${muscle}%` : "—", detail: muscleClass, extra: "Classificação automática" },
          { label: "Visceral", value: visceral || "—", detail: visceralClass, extra: "Escala 1–30" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
            <p className="text-xs text-white/40">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{card.value}</p>
            <p className="mt-1 text-xs font-semibold uppercase text-primary">{card.detail}</p>
            <p className="mt-1 text-[11px] text-white/40">{card.extra}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white">Anamnese Digital</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {["Objetivo do protocolo", "Condições pré-existentes", "Medicamentos atuais", "Rotina de exercícios"].map((label) => (
            <label key={label} className="space-y-2">
              <span className="text-xs text-white/60">{label}</span>
              <textarea className="min-h-20 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none focus:border-primary/40" />
            </label>
          ))}
        </div>
        <Button className="mt-4">
          <Save className="mr-2 h-4 w-4" /> Salvar avaliação
        </Button>
      </div>
    </div>
  );
}
