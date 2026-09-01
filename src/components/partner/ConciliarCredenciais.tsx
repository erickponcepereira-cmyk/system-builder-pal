import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Link2, ArrowRight } from "lucide-react";
import {
  obterConciliacao, ligarCredencial, ligarLote,
  type Conciliacao, type Confianca, type ParaLigar,
} from "@/lib/academia-conciliacao.functions";
import {
  BOTAO_ACAO, BOTAO_NEUTRO, BOTAO_TEXTO, CAMPO,
  Bloco, Cartao, EYEBROW, NOTA, Pilula, Selo, escolha, type Tom,
} from "@/components/partner/VisualAcademia";

/**
 * Conciliação: ligar quem está no leitor a quem tem conta na plataforma.
 *
 * Enquanto a credencial não tem `student_id`, a pessoa existe para a CATRACA e
 * não existe para o APLICATIVO: `academia_meu_qr`, `academia_minhas_academias`
 * e `academia_reservar_aula` todas partem do aluno. Sem vínculo não há QR, não
 * há reserva, não há app. É por isso que esta tela é o gargalo da vertical
 * inteira, e não uma faxina de cadastro.
 *
 * A TELA MOSTRA O QUE NÃO DÁ PARA LIGAR. Na Estação são 413 credenciais sem
 * vínculo e cerca de 26 com algum candidato — as outras não têm com quem casar
 * porque a pessoa não tem conta na FitMind. Uma tela que listasse só os pares
 * faria a conciliação parecer quase pronta. O número grande e desconfortável
 * fica em cima, ao lado dos outros.
 */

const CONFIANCA: Record<Confianca, { label: string; tom: Tom; explica: string }> = {
  alta: {
    label: "Alta", tom: "ok",
    explica: "Telefone idêntico e único dos dois lados, e o nome confere. É seguro ligar em lote.",
  },
  media: {
    label: "Média", tom: "atencao",
    explica: "O telefone bate e é único, mas o nome não fecha. Confira antes de ligar.",
  },
  baixa: {
    label: "Baixa", tom: "critico",
    explica: "Só o nome se parece, ou o telefone serve a mais de uma pessoa. Ligue uma a uma, olhando.",
  },
};

function Par({ p, ligando, aoLigar }: {
  p: ParaLigar; ligando: boolean; aoLigar: (p: ParaLigar) => void;
}) {
  return (
    <Bloco tom={CONFIANCA[p.confianca].tom}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-2">
          <div className="min-w-0">
            <p className={EYEBROW}>No leitor</p>
            <p className="truncate text-sm font-semibold text-aca-ink">{p.nome ?? "Sem nome"}</p>
            {p.telefone && <p className="truncate text-[11px] tabular-nums text-aca-fraco">{p.telefone}</p>}
          </div>

          <ArrowRight aria-hidden className="hidden h-4 w-4 shrink-0 text-aca-fraco sm:block" />

          <div className="min-w-0">
            <p className={EYEBROW}>Conta na FitMind</p>
            <p className="truncate text-sm font-semibold text-aca-ink">{p.aluno}</p>
            {p.aluno_telefone && <p className="truncate text-[11px] tabular-nums text-aca-fraco">{p.aluno_telefone}</p>}
          </div>
        </div>

        <button
          type="button"
          onClick={() => aoLigar(p)}
          disabled={ligando}
          className={`shrink-0 ${BOTAO_NEUTRO}`}
        >
          {ligando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Ligar
        </button>
      </div>

      {/* O motivo vem do banco em português. É ele que impede a conciliação de
          virar um "confia em mim" — sobretudo nos pares de telefone de família. */}
      <p className={`mt-1.5 ${NOTA}`}>{p.motivo}</p>
    </Bloco>
  );
}

export function ConciliarCredenciais({ partnerId, aoMudar }: {
  partnerId: string; aoMudar?: () => void;
}) {
  const obter = useServerFn(obterConciliacao);
  const ligarUm = useServerFn(ligarCredencial);
  const ligarTodas = useServerFn(ligarLote);

  const [dados, setDados] = useState<Conciliacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ligando, setLigando] = useState<string | null>(null);
  const [emLote, setEmLote] = useState(false);
  const [filtro, setFiltro] = useState<Confianca | null>(null);
  const [termo, setTermo] = useState("");

  const carregar = useCallback(() => {
    setCarregando(true);
    obter({ data: { partnerId } })
      .then((r) => setDados(r as Conciliacao))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Não deu para carregar a conciliação"))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  useEffect(carregar, [carregar]);

  const porConfianca = useMemo(() => {
    const c: Record<Confianca, ParaLigar[]> = { alta: [], media: [], baixa: [] };
    for (const s of dados?.sugestoes ?? []) c[s.confianca]?.push(s);
    return c;
  }, [dados]);

  const visiveis = useMemo(() => {
    const base = filtro ? porConfianca[filtro] : (dados?.sugestoes ?? []);
    const t = termo.trim().toLowerCase();
    if (!t) return base;
    return base.filter((p) =>
      (p.nome ?? "").toLowerCase().includes(t) || p.aluno.toLowerCase().includes(t));
  }, [dados, filtro, porConfianca, termo]);

  const ligar = async (p: ParaLigar) => {
    setLigando(p.credencial_id);
    try {
      const r = await ligarUm({ data: { partnerId, credencialId: p.credencial_id, studentId: p.student_id } });
      toast.success(r.relato);
      carregar();
      aoMudar?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ligar.");
    } finally {
      setLigando(null);
    }
  };

  const ligarAsAltas = async () => {
    const pares = porConfianca.alta.map((p) => ({
      credencialId: p.credencial_id, studentId: p.student_id, nome: p.nome,
    }));
    if (pares.length === 0) return;

    setEmLote(true);
    try {
      const feitos = await ligarTodas({ data: { partnerId, pares } });
      const ok = feitos.filter((f) => f.ok);
      const religadas = ok.reduce((s, f) => s + f.mensalidades_religadas, 0);
      const falhou = feitos.filter((f) => !f.ok);

      toast.success(
        `${ok.length} de ${feitos.length} ligada(s)`
        + (religadas ? ` · ${religadas} mensalidade(s) passaram a valer para a credencial` : ""),
      );
      // Uma colisão não derruba as outras, mas some da tela se ninguém disser.
      for (const f of falhou.slice(0, 3)) toast.error(`${f.nome ?? "Sem nome"}: ${f.erro}`);
      carregar();
      aoMudar?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "O lote não foi aplicado.");
    } finally {
      setEmLote(false);
    }
  };

  if (!dados) return <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-aca-acao" />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Cartao
          rot="Já ligadas"
          valor={String(dados.ligadas)}
          nota="Têm conta e usam o aplicativo."
          tom="ok"
        />
        <Cartao
          rot="Sem vínculo"
          valor={String(dados.sem_vinculo)}
          nota="Entram pela catraca, mas não existem no aplicativo."
          tom="atencao"
        />
        <Cartao
          rot="Dá para ligar agora"
          valor={String(dados.sugestoes.length ? new Set(dados.sugestoes.map((s) => s.credencial_id)).size : 0)}
          nota="Achei uma conta que combina com estas."
          tom="neutro"
        />
        <Cartao
          rot="Sem conta na FitMind"
          valor={String(dados.sem_candidato)}
          nota="Não há ninguém para ligar: a pessoa ainda não se cadastrou."
          tom="critico"
        />
      </div>

      {/* Sem este bloco, o número acima vira um mistério e a academia fica
          esperando que a tela resolva sozinha o que só o aluno resolve. */}
      {dados.sem_candidato > 0 && (
        <Bloco tom="critico">
          <p className="text-[12px] font-bold text-aca-ink">
            {dados.sem_candidato} pessoa(s) não têm conta na FitMind — e é isso que trava o resto
          </p>
          <p className={`mt-1 ${NOTA}`}>
            Credencial sem aluno entra pela catraca e mais nada:
            <strong className="font-semibold text-aca-ink"> não gera QR, não reserva aula e não
            aparece no aplicativo</strong>. Elas vieram da planilha do sistema antigo, com nome e
            telefone, sem conta. O caminho é a pessoa se cadastrar no aplicativo com
            <strong className="font-semibold text-aca-ink"> o mesmo telefone</strong> que está aqui —
            é por ele que a conciliação casa.
          </p>
          <p className={`mt-1 ${NOTA}`}>
            O vínculo <strong className="font-semibold text-aca-ink">não acontece sozinho</strong>{" "}
            quando ela se cadastra. Volte aqui depois de uma leva de cadastros e ligue: esta tela é
            para ser aberta de novo, não uma vez só.
          </p>
        </Bloco>
      )}

      {dados.sugestoes.length === 0 ? (
        <p className={`py-6 text-center ${NOTA}`}>
          Nenhum par para conciliar agora.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(["alta", "media", "baixa"] as Confianca[]).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={filtro === c}
                onClick={() => setFiltro(filtro === c ? null : c)}
                className={`rounded-full px-3 py-1.5 text-[11px] transition ${escolha(filtro === c)}`}
              >
                {CONFIANCA[c].label} · {porConfianca[c].length}
              </button>
            ))}
            {filtro && (
              <button type="button" onClick={() => setFiltro(null)} className={BOTAO_TEXTO}>
                ver todos
              </button>
            )}
          </div>

          {filtro && (
            <p className={NOTA}>{CONFIANCA[filtro].explica}</p>
          )}

          {porConfianca.alta.length > 0 && (
            <Bloco tom="ok" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold text-aca-ink">
                  {porConfianca.alta.length} par(es) de confiança alta
                </p>
                <Pilula tom="ok">1 para 1</Pilula>
              </div>
              <p className={NOTA}>{CONFIANCA.alta.explica}</p>
              <button
                type="button"
                onClick={() => void ligarAsAltas()}
                disabled={emLote}
                className={`w-full ${BOTAO_ACAO}`}
              >
                {emLote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Ligar as {porConfianca.alta.length} de confiança alta
              </button>
            </Bloco>
          )}

          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Procurar por nome, dos dois lados"
            className={`w-full ${CAMPO}`}
          />

          {carregando ? (
            <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-aca-acao" />
          ) : visiveis.length === 0 ? (
            <p className={`py-6 text-center ${NOTA}`}>Nenhum par com esse nome.</p>
          ) : (
            <div className="space-y-2">
              {visiveis.map((p) => (
                <div key={`${p.credencial_id}-${p.student_id}`} className="space-y-1">
                  <div className="flex justify-end">
                    <Selo>confiança {CONFIANCA[p.confianca].label.toLowerCase()}</Selo>
                  </div>
                  <Par p={p} ligando={ligando === p.credencial_id} aoLigar={(x) => void ligar(x)} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
