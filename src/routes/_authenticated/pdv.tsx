import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Car, Loader2, LogOut, Plus, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import {
  carregarUnidades,
  escolherUnidadeAtiva,
  lembrarUnidadeAtiva,
  pode,
  type Unidade,
} from "@/lib/unidades-parceiro";
import {
  formatarPermanencia,
  formatarPlaca,
  isPlacaValida,
  minutosDesde,
  normalizarPlaca,
} from "@/lib/pdv-patio";

export const Route = createFileRoute("/_authenticated/pdv")({
  head: () => ({ meta: [{ title: "PDV — FitMind Club" }] }),
  component: PainelPdv,
});

type LinhaPatio = {
  ticket_id: string;
  numero: string;
  vaga_codigo: string | null;
  vaga_setor: string | null;
  placa: string;
  modelo: string | null;
  cor: string | null;
  entrada_em: string;
  minutos: number;
  valor: number;
  status: string;
};

type Vaga = { id: string; codigo: string; setor: string | null };

const reais = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * PDV do estacionamento, fora do painel de parceiro.
 *
 * Mesma razão do painel da academia: quem opera a guarita não é quem cuida de
 * produto, carteira e comissão. Aqui só existe pátio — venda, pagamento e
 * caixa entram quando o resto da fase 2 for liberado.
 */
function PainelPdv() {
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [ativa, setAtiva] = useState<Unidade | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { void navigate({ to: "/login" }); return; }
        const { data: perfil } = await supabase
          .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
        if (!perfil?.id || !vivo) return;

        const lista = (await carregarUnidades(perfil.id)).filter((u) => pode(u, "pdv.operar"));
        if (!vivo) return;
        setUnidades(lista);
        setAtiva(escolherUnidadeAtiva(lista));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [navigate]);

  const trocar = (u: Unidade) => {
    setAtiva(u);
    lembrarUnidadeAtiva(u.partnerId);
  };

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0B0B]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white">
      <header
        className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 px-4 py-3"
        style={{
          backgroundColor: "#141414",
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Logo className="h-8 w-8" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{ativa?.fantasyName ?? "PDV"}</p>
            <p className="text-[10px] opacity-60">Pátio do estacionamento</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RoleSwitcher current="partner" />
          <button
            onClick={() => void supabase.auth.signOut().then(() => navigate({ to: "/login" }))}
            aria-label="Sair"
            className="ml-1 flex h-10 w-10 items-center justify-center rounded-lg opacity-70 hover:opacity-100"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {unidades.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-b border-white/5 px-4 py-2" style={{ backgroundColor: "#141414" }}>
          {unidades.map((u) => (
            <button
              key={u.partnerId}
              onClick={() => trocar(u)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                u.partnerId === ativa?.partnerId ? "bg-primary text-black" : "bg-white/5 text-white/70"
              }`}
            >
              {u.fantasyName}
            </button>
          ))}
        </div>
      )}

      {ativa ? (
        <Patio unidade={ativa} />
      ) : (
        <div className="px-6 py-16 text-center text-sm text-white/60">
          Nenhuma unidade com PDV liberado para você. Peça a permissão
          <span className="mx-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">pdv.operar</span>
          a quem administra a unidade.
        </div>
      )}
    </div>
  );
}

function Patio({ unidade }: { unidade: Unidade }) {
  const [linhas, setLinhas] = useState<LinhaPatio[]>([]);
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [busca, setBusca] = useState("");
  const [agora, setAgora] = useState(() => new Date());

  const recarregar = useCallback(async () => {
    setErro(null);
    const [patio, listaVagas] = await Promise.all([
      supabase.rpc("pdv_patio" as never, { _partner_id: unidade.partnerId } as never),
      supabase.from("pdv_vagas" as never)
        .select("id, codigo, setor" as never)
        .eq("partner_id" as never, unidade.partnerId as never)
        .eq("ativa" as never, true as never)
        .order("ordem" as never),
    ]);
    if (patio.error) { setErro(patio.error.message); return; }
    setLinhas((patio.data as unknown as LinhaPatio[]) ?? []);
    setVagas((listaVagas.data as unknown as Vaga[]) ?? []);
    setAgora(new Date());
  }, [unidade.partnerId]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    void recarregar().finally(() => { if (vivo) setCarregando(false); });
    const doServidor = setInterval(() => { void recarregar(); }, 60_000);
    const doRelogio = setInterval(() => setAgora(new Date()), 30_000);
    return () => { vivo = false; clearInterval(doServidor); clearInterval(doRelogio); };
  }, [recarregar]);

  const ocupadas = useMemo(
    () => new Set(linhas.map((l) => l.vaga_codigo).filter(Boolean) as string[]),
    [linhas],
  );
  const livres = useMemo(() => vagas.filter((v) => !ocupadas.has(v.codigo)), [vagas, ocupadas]);

  const filtradas = useMemo(() => {
    const alvo = normalizarPlaca(busca);
    if (!alvo) return linhas;
    return linhas.filter((l) => l.placa.includes(alvo));
  }, [linhas, busca]);

  if (carregando) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/40">No pátio</p>
          <p className="text-lg font-bold">
            {linhas.length}
            {vagas.length > 0 && <span className="text-sm font-normal text-white/50"> / {vagas.length} vagas</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void recarregar()}
            aria-label="Atualizar"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAbrindo(true)}
            className="flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-bold text-black"
          >
            <Plus className="h-4 w-4" /> Entrada
          </button>
        </div>
      </div>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar placa"
        inputMode="text"
        autoCapitalize="characters"
        className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-white/30"
      />

      {erro && (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {erro}
        </p>
      )}

      {filtradas.length === 0 ? (
        <div className="py-16 text-center text-sm text-white/50">
          <Car className="mx-auto mb-3 h-8 w-8 opacity-30" />
          {linhas.length === 0 ? "Pátio vazio." : "Nenhuma placa com esse trecho."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtradas.map((l) => (
            <LinhaDoPatio key={l.ticket_id} linha={l} agora={agora} />
          ))}
        </ul>
      )}

      {abrindo && (
        <FormEntrada
          partnerId={unidade.partnerId}
          vagasLivres={livres}
          onFechar={() => setAbrindo(false)}
          onPronto={() => { setAbrindo(false); void recarregar(); }}
        />
      )}
    </div>
  );
}

function LinhaDoPatio({ linha, agora }: { linha: LinhaPatio; agora: Date }) {
  const minutos = Math.max(linha.minutos, minutosDesde(linha.entrada_em, agora));
  const aguardando = linha.status === "aguardando_pagamento";
  const entrada = new Date(linha.entrada_em).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="w-12 shrink-0 text-center text-xs font-bold text-white/50">
            {linha.vaga_codigo ?? "—"}
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-base font-bold">{formatarPlaca(linha.placa)}</p>
            <p className="truncate text-[11px] text-white/45">
              {entrada}
              {linha.modelo && ` · ${linha.modelo}`}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold">{formatarPermanencia(minutos)}</p>
          {linha.valor > 0 ? (
            <p className={`text-sm font-bold ${aguardando ? "text-amber-400" : "text-white"}`}>
              {reais(linha.valor)}
            </p>
          ) : (
            <p className="text-[11px] font-semibold text-emerald-400">na tolerância</p>
          )}
        </div>
      </div>
    </li>
  );
}

function FormEntrada({
  partnerId,
  vagasLivres,
  onFechar,
  onPronto,
}: {
  partnerId: string;
  vagasLivres: Vaga[];
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [placa, setPlaca] = useState("");
  const [vagaId, setVagaId] = useState<string>("");
  const [modelo, setModelo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const placaOk = isPlacaValida(placa);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("pdv_abrir_ticket" as never, {
      _partner_id: partnerId,
      _placa: placa,
      _vaga_id: vagaId || null,
      _modelo: modelo || null,
    } as never);
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    onPronto();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70" onClick={onFechar}>
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#141414] p-5"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Entrada</h2>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-lg p-2 opacity-60 hover:opacity-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs uppercase tracking-wide text-white/40">Placa</label>
        <input
          value={placa}
          onChange={(e) => setPlaca(e.target.value.toUpperCase())}
          placeholder="ABC1D23"
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={8}
          className="mb-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-center font-mono text-2xl tracking-widest outline-none placeholder:text-white/20"
        />
        <p className="mb-4 h-4 text-center text-[11px] text-white/40">
          {placa.length > 0 && !placaOk && "Placa incompleta"}
        </p>

        {vagasLivres.length > 0 && (
          <>
            <label className="mb-1 block text-xs uppercase tracking-wide text-white/40">
              Vaga <span className="normal-case text-white/25">(opcional)</span>
            </label>
            <select
              value={vagaId}
              onChange={(e) => setVagaId(e.target.value)}
              className="mb-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none"
            >
              <option value="">Sem vaga fixa</option>
              {vagasLivres.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.codigo}{v.setor ? ` · ${v.setor}` : ""}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="mb-1 block text-xs uppercase tracking-wide text-white/40">
          Modelo <span className="normal-case text-white/25">(opcional)</span>
        </label>
        <input
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
          placeholder="Gol prata"
          className="mb-5 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-white/30"
        />

        {erro && (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {erro}
          </p>
        )}

        <button
          onClick={() => void salvar()}
          disabled={!placaOk || salvando}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-black disabled:opacity-40"
        >
          {salvando ? <Loader2 className="h-5 w-5 animate-spin" /> : "Registrar entrada"}
        </button>
      </div>
    </div>
  );
}
