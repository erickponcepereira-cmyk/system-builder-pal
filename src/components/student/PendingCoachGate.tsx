import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { ModalShell } from "@/components/ui/ModalShell";
import { CoachSelector, type CoachOption } from "@/components/auth/CoachSelector";
import { maskPhone } from "@/lib/masks";
import {
  getMyPendingCoachStatus,
  submitMyPendingCoach,
  type PendingCoachStatus,
} from "@/lib/pending-coach.functions";
import { enriquecerAtribuicao, lerAtribuicao, lerToqueId, resolverToque } from "@/lib/atribuicao";

/**
 * Alunos cuja conta foi recuperada automaticamente (cadastro incompleto)
 * precisam informar quem foi o coach que os trouxe e completar os dados
 * que ficaram faltando. Bloqueia o app até responder.
 */
export function PendingCoachGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PendingCoachStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [coach, setCoach] = useState<CoachOption | null>(null);
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [saving, setSaving] = useState(false);
  /** Coach veio do convite: campo travado, sem escolha manual. */
  const [coachTravado, setCoachTravado] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await getMyPendingCoachStatus();
        if (!active) return;
        if (!res.pending) {
          setChecking(false);
          return;
        }

        // Recuperação automática: se a indicação do link ainda está guardada
        // no aparelho, o coach volta sozinho — sem depender da pessoa lembrar.
        let atribuicao = lerAtribuicao();
        if (atribuicao?.codigo && !atribuicao.coachId) {
          atribuicao = await enriquecerAtribuicao();
        }
        let coachIdSalvo = atribuicao?.coachId ?? null;
        let coachNomeSalvo = atribuicao?.coachNome ?? null;
        // Storage perdido no meio do login social: usa o toque do servidor.
        if (!coachIdSalvo) {
          const t = await resolverToque(lerToqueId());
          if (t?.coachId) {
            coachIdSalvo = t.coachId;
            coachNomeSalvo = t.sponsorName;
          }
        }
        if (coachIdSalvo) setCoachTravado(true);

        if (coachIdSalvo) {
          const faltaAlgo = res.missing.phone || res.missing.gender || res.missing.birthdate;
          if (!faltaAlgo) {
            try {
              await submitMyPendingCoach({ data: { coachId: coachIdSalvo } });
              if (active) {
                setStatus(null);
                setChecking(false);
              }
              return; // coach restaurado, nada a perguntar
            } catch {
              /* cai no formulário abaixo */
            }
          }
          setCoach({
            id: coachIdSalvo,
            profileId: "",
            name: coachNomeSalvo || "Coach da sua indicação",
          });
        }

        if (active) {
          setStatus(res);
          setChecking(false);
        }
      } catch {
        if (active) {
          // Falha fechada: nunca libera o app sem conseguir comprovar o vínculo.
          setStatus({
            pending: true,
            studentId: null,
            profileId: null,
            name: null,
            missing: { phone: false, gender: false, birthdate: false },
          });
          setChecking(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background text-sm text-muted-foreground">
        Verificando cadastro...
      </div>
    );
  }

  if (!status?.pending) return <>{children}</>;

  const handleSave = async () => {
    if (!coach?.id) return toast.error("Selecione o coach que te trouxe para o FitMind.");
    if (status.missing.phone && phone.replace(/\D/g, "").length < 10) return toast.error("Informe seu WhatsApp com DDD.");
    if (status.missing.gender && !gender) return toast.error("Selecione seu gênero.");
    if (status.missing.birthdate && !birthdate) return toast.error("Informe sua data de nascimento.");

    setSaving(true);
    try {
      await submitMyPendingCoach({
        data: {
          coachId: coach.id,
          ...(status.missing.phone ? { phone } : {}),
          ...(status.missing.gender ? { gender: gender as "M" | "F" | "O" } : {}),
          ...(status.missing.birthdate ? { birthdate } : {}),
        },
      });
      toast.success("Cadastro concluído. Bem-vindo(a)!");
      setStatus(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      zIndex={80}
      header={
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-bold text-white">Complete seu cadastro</h2>
          <p className="mt-1 text-xs text-white/60">
            Faltaram algumas informações no seu cadastro. Preencha para liberar tudo no app.
          </p>
        </div>
      }
      footer={
        <div className="border-t border-white/10 p-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Concluir cadastro"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <CoachSelector
          value={coach}
          onChange={setCoach}
          locked={coachTravado}
          label="Quem é o coach que te trouxe? *"
        />

        {status.missing.phone && (
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">WhatsApp *</label>
            <input
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="(65) 99999-9999"
              inputMode="tel"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            />
          </div>
        )}

        {status.missing.gender && (
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Gênero *</label>
            <div className="flex gap-2">
              {[
                { v: "F", l: "Feminino" },
                { v: "M", l: "Masculino" },
                { v: "O", l: "Outro" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setGender(o.v)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold ${
                    gender === o.v ? "border-primary bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-white/70"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        )}

        {status.missing.birthdate && (
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">Data de nascimento *</label>
            <input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            />
          </div>
        )}
      </div>
    </ModalShell>
  );
}

export default PendingCoachGate;
