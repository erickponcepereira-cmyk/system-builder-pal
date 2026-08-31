import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Loader2, CalendarDays, QrCode, Check, X, AlertTriangle, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/student/academia")({
  head: () => ({
    meta: [
      { title: "Minha academia — FitMind Club" },
      { name: "description", content: "Reserve sua aula e mostre o QR da mensalidade na entrada da academia." },
      { property: "og:title", content: "Minha academia — FitMind Club" },
      { property: "og:description", content: "Reserve sua aula e mostre o QR da mensalidade na entrada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinhaAcademia,
});

type Academia = {
  partner_id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  regime_turma: string;
  tem_reserva: boolean;
};

type Aula = {
  turma_id: string;
  turma: string;
  data: string;
  hora_inicio: string;
  hora_fim: string | null;
  capacidade: number | null;
  reservados: number;
  vagas: number;
  fechada: boolean;
  motivo: string | null;
  eu_reservei: boolean;
  minha_reserva_id: string | null;
};

type MeuQr = {
  ok: boolean;
  token?: string;
  nome?: string;
  motivo?: string;
  valido_ate?: string | null;
  dias_restantes?: number | null;
  liberado?: boolean;
  erro?: string;
};

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "—");

/** Data local sem passar por fuso: `new Date("2026-09-01")` volta 31/08 aqui. */
const rotuloDoDia = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  return `${DIAS[dt.getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
};

const SITUACAO: Record<string, { texto: string; classe: string }> = {
  contrato_ativo: { texto: "Mensalidade em dia", classe: "text-emerald-500" },
  vencimento_proximo: { texto: "Vence em breve", classe: "text-amber-500" },
  em_carencia: { texto: "Venceu, mas você ainda entra", classe: "text-amber-500" },
  vencido_bloqueado: { texto: "Mensalidade vencida", classe: "text-red-500" },
  sem_mensalidade: { texto: "Sem mensalidade ativa", classe: "text-red-500" },
};

function MinhaAcademia() {
  const [academias, setAcademias] = useState<Academia[]>([]);
  const [escolhida, setEscolhida] = useState<Academia | null>(null);
  const [qr, setQr] = useState<MeuQr | null>(null);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [reservando, setReservando] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .rpc("academia_minhas_academias" as never, {} as never)
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); setCarregando(false); return; }
        const lista = (data ?? []) as unknown as Academia[];
        setAcademias(lista);
        setEscolhida(lista[0] ?? null);
        if (lista.length === 0) setCarregando(false);
      });
  }, []);

  const carregar = useCallback(() => {
    if (!escolhida) return;
    setCarregando(true);
    Promise.all([
      supabase.rpc("academia_meu_qr" as never, { p_partner_id: escolhida.partner_id } as never),
      escolhida.tem_reserva
        ? supabase.rpc("academia_aulas_disponiveis" as never, { p_partner_id: escolhida.partner_id } as never)
        : Promise.resolve({ data: [], error: null }),
    ]).then(([q, a]) => {
      if (q.error) toast.error(q.error.message);
      else setQr(q.data as unknown as MeuQr);
      if (a.error) toast.error(a.error.message);
      else setAulas((a.data ?? []) as unknown as Aula[]);
      setCarregando(false);
    });
  }, [escolhida]);

  useEffect(carregar, [carregar]);

  const reservar = (aula: Aula) => {
    if (!escolhida) return;
    setReservando(`${aula.turma_id}|${aula.data}`);

    const chamada = aula.eu_reservei && aula.minha_reserva_id
      ? supabase.rpc("academia_cancelar_reserva" as never, { p_reserva_id: aula.minha_reserva_id } as never)
      : supabase.rpc("academia_reservar_aula" as never, {
          p_partner_id: escolhida.partner_id, p_turma_id: aula.turma_id, p_data: aula.data,
        } as never);

    Promise.resolve(chamada)
      .then(({ data, error }) => {
        if (error) return toast.error(error.message);
        const r = data as unknown as { ok: boolean; erro?: string };
        if (!r?.ok) return toast.error(r?.erro ?? "Não deu para reservar");
        toast.success(aula.eu_reservei ? "Reserva cancelada." : "Vaga reservada!");
        carregar();
      })
      .finally(() => setReservando(null));
  };

  // Agrupar por dia é o que torna a lista navegável: 6 aulas por dia durante
  // duas semanas são 84 linhas soltas.
  const porDia = useMemo(() => {
    const mapa = new Map<string, Aula[]>();
    for (const a of aulas) {
      if (!mapa.has(a.data)) mapa.set(a.data, []);
      mapa.get(a.data)!.push(a);
    }
    return [...mapa.entries()];
  }, [aulas]);

  if (carregando && !qr && academias.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  if (academias.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <MapPin className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-bold text-foreground">Você ainda não está em uma academia</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Assim que a academia cadastrar você, seu QR de entrada aparece aqui.
        </p>
      </div>
    );
  }

  const sit = SITUACAO[qr?.motivo ?? ""] ?? { texto: qr?.motivo ?? "", classe: "text-muted-foreground" };

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Minha academia</h1>
        {academias.length > 1 ? (
          <select
            value={escolhida?.partner_id ?? ""}
            onChange={(e) => setEscolhida(academias.find((a) => a.partner_id === e.target.value) ?? null)}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {academias.map((a) => <option key={a.partner_id} value={a.partner_id}>{a.nome}</option>)}
          </select>
        ) : (
          <p className="text-sm text-muted-foreground">{escolhida?.nome}</p>
        )}
      </div>

      {/* ---------- o QR ---------- */}
      <section className="rounded-2xl border border-border bg-card p-5 text-center">
        <div className="mb-1 flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <QrCode className="h-3.5 w-3.5" /> Sua entrada
        </div>

        {qr?.ok && qr.token ? (
          <>
            <div className="mx-auto my-4 w-fit rounded-xl bg-white p-3">
              <QRCodeSVG value={qr.token} size={196} level="H" />
            </div>
            <div className="font-semibold text-foreground">{qr.nome}</div>
            <div className={`mt-1 flex items-center justify-center gap-1.5 text-sm font-medium ${sit.classe}`}>
              {qr.liberado ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              {sit.texto}
            </div>
            {qr.valido_ate && (
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                Vence em {qr.valido_ate.slice(8, 10)}/{qr.valido_ate.slice(5, 7)}/{qr.valido_ate.slice(0, 4)}
                {typeof qr.dias_restantes === "number" && qr.dias_restantes >= 0 && ` · ${qr.dias_restantes} dia(s)`}
              </div>
            )}
            {!qr.liberado && (
              <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">
                Regularize a mensalidade na recepção. Com ela vencida, o código não abre a entrada.
              </p>
            )}
          </>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">{qr?.erro ?? "Carregando seu código..."}</p>
        )}
      </section>

      {/* ---------- reservar ---------- */}
      {escolhida?.tem_reserva ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarDays className="h-4 w-4" /> Reserve sua aula
          </div>

          {porDia.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              A academia ainda não cadastrou a grade de aulas.
            </p>
          ) : (
            porDia.map(([data, doDia]) => (
              <div key={data} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {rotuloDoDia(data)}
                </div>
                <div className="divide-y divide-border">
                  {doDia.map((a) => {
                    const ocupado = reservando === `${a.turma_id}|${a.data}`;
                    const bloqueada = a.fechada && !a.eu_reservei;
                    return (
                      <div key={a.turma_id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground tabular-nums">
                            {hhmm(a.hora_inicio)}–{hhmm(a.hora_fim)} · {a.turma}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {a.motivo
                              ? a.motivo
                              : a.vagas < 0
                                ? "sem limite de vagas"
                                : `${a.vagas} vaga(s) de ${a.capacidade}`}
                          </div>
                        </div>

                        {a.eu_reservei ? (
                          <button
                            type="button" disabled={ocupado} onClick={() => reservar(a)}
                            className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-500"
                          >
                            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "reservado · cancelar"}
                          </button>
                        ) : bloqueada ? (
                          <span className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
                            {a.motivo === "sem vagas" ? "lotada" : "indisponível"}
                          </span>
                        ) : (
                          <button
                            type="button" disabled={ocupado || !qr?.liberado} onClick={() => reservar(a)}
                            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
                            title={qr?.liberado ? undefined : "Regularize a mensalidade para reservar"}
                          >
                            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "reservar"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      ) : (
        <p className="flex items-start gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Nesta academia você treina no horário que quiser — não precisa reservar. É só mostrar o QR na entrada.
        </p>
      )}
    </div>
  );
}
