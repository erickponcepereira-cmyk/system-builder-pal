import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardList, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { AnamnesisView } from "@/components/shared/AnamnesisView";
import { DEFAULT_QUESTIONS } from "@/components/professional/AnamneseTab";
import {
  listarAnamneses,
  verAnamnese,
  type AnamneseCompleta,
  type AnamneseResumo,
  type PerguntaDoProfissional,
  type TipoAnamnese,
} from "@/lib/admin-anamneses.functions";

export const Route = createFileRoute("/_authenticated/admin/anamneses")({
  component: AdminAnamneses,
});

type Filtro = "todas" | TipoAnamnese;

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "aluno", rotulo: "Do aluno" },
  { valor: "profissional", rotulo: "De profissional" },
];

const CARTAO = { backgroundColor: "#1A1A1A" };

/**
 * Sem acento e sem letra dobrada: nome brasileiro se escreve de vários jeitos,
 * e "Arianne" precisa achar "ARIANE", "Gabriela" achar "Gabriella".
 */
const paraBusca = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/(.)\1+/g, "$1");

/** Cada palavra precisa estar no nome, em qualquer ordem: "ariane moraes" acha "Ariane Nataly de Moraes". */
function casaBusca(resumo: AnamneseResumo, busca: string) {
  const nome = paraBusca(resumo.nome);
  return paraBusca(busca).split(/\s+/).filter(Boolean).every((palavra) => nome.includes(palavra));
}

const dataBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const rotuloDoTipo = (a: AnamneseResumo) =>
  a.tipo === "aluno" ? "Preenchida pelo aluno" : `Preenchida por ${a.profissional}`;

function AdminAnamneses() {
  const [anamneses, setAnamneses] = useState<AnamneseResumo[] | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [aberta, setAberta] = useState<AnamneseResumo | null>(null);

  useEffect(() => {
    listarAnamneses()
      .then((r) => setAnamneses(r.anamneses))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Não foi possível carregar as anamneses");
        setAnamneses([]);
      });
  }, []);

  const lista = useMemo(
    () => (anamneses ?? []).filter((a) => (filtro === "todas" || a.tipo === filtro) && casaBusca(a, busca)),
    [anamneses, filtro, busca],
  );

  // A busca e o filtro continuam valendo na volta: quem abriu uma ficha quase
  // sempre quer a próxima da mesma lista.
  if (aberta) return <FichaAberta resumo={aberta} aoVoltar={() => setAberta(null)} />;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Anamneses</h1>
        <p className="text-sm text-white/50">
          Todas as anamneses preenchidas: as do aluno no app e as que os profissionais fazem com os clientes.
        </p>
      </div>

      <div className="rounded-2xl p-5" style={CARTAO}>
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
          <Search className="h-4 w-4 text-white/40" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filtro === f.valor ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {f.rotulo}
            </button>
          ))}
          {anamneses && (
            <span className="ml-auto text-xs text-white/40">
              {lista.length} de {anamneses.length}
            </span>
          )}
        </div>

        {!anamneses ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/50">
            {anamneses.length === 0 ? "Nenhuma anamnese preenchida ainda." : "Nenhuma anamnese com esse nome."}
          </p>
        ) : (
          <div className="space-y-2">
            {lista.map((a) => (
              <button
                key={`${a.tipo}-${a.id}`}
                onClick={() => setAberta(a)}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/5 p-3 text-left hover:bg-white/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{a.nome}</p>
                  <p className="truncate text-xs text-white/40">
                    {[a.contato, rotuloDoTipo(a), dataBR(a.preenchidaEm)].filter(Boolean).join(" · ")}
                  </p>
                  {a.alertas.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {a.alertas.map((alerta) => (
                        <span key={alerta} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                          {alerta}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FichaAberta({ resumo, aoVoltar }: { resumo: AnamneseResumo; aoVoltar: () => void }) {
  const [completa, setCompleta] = useState<AnamneseCompleta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    verAnamnese({ data: { tipo: resumo.tipo, id: resumo.id } })
      .then(setCompleta)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível abrir a anamnese"));
  }, [resumo.tipo, resumo.id]);

  return (
    <>
      <div className="mb-4 rounded-2xl p-4" style={CARTAO}>
        <button onClick={aoVoltar} className="mb-2 flex items-center gap-1 text-xs text-white/40 hover:text-white">
          <ArrowLeft className="h-3 w-3" /> Voltar para a lista
        </button>
        <p className="text-base font-bold text-white">{resumo.nome}</p>
        <p className="text-xs text-white/40">
          {[resumo.contato, rotuloDoTipo(resumo), dataBR(resumo.preenchidaEm)].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="rounded-2xl p-5" style={CARTAO}>
        {erro ? (
          <p className="py-6 text-center text-sm text-red-400">{erro}</p>
        ) : !completa ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : completa.tipo === "aluno" ? (
          <AnamnesisView row={completa.ficha} />
        ) : (
          <RespostasDoProfissional respostas={completa.respostas} perguntas={completa.perguntas} />
        )}
      </div>
    </>
  );
}

/**
 * Casa cada resposta com o texto da pergunta.
 *
 * As chaves são ids: das perguntas do profissional, ou `_d1`… das padrão quando
 * ele não personalizou. Resposta cuja pergunta ele já apagou continua valendo —
 * aparece no fim, sem o enunciado, em vez de sumir.
 */
function perguntasRespondidas(respostas: Record<string, string>, perguntas: PerguntaDoProfissional[]) {
  const conhecidas = [...perguntas, ...DEFAULT_QUESTIONS];
  const idsConhecidos = new Set(conhecidas.map((p) => p.id));
  const respondidas = conhecidas
    .filter((p) => (respostas[p.id] ?? "").trim())
    .map((p) => ({ chave: p.id, pergunta: p.label, resposta: respostas[p.id] }));
  const semEnunciado = Object.entries(respostas)
    .filter(([chave, valor]) => !idsConhecidos.has(chave) && valor.trim())
    .map(([chave, valor]) => ({ chave, pergunta: "Pergunta que o profissional removeu", resposta: valor }));
  return [...respondidas, ...semEnunciado];
}

function RespostasDoProfissional({ respostas, perguntas }: {
  respostas: Record<string, string>;
  perguntas: PerguntaDoProfissional[];
}) {
  const itens = perguntasRespondidas(respostas, perguntas);
  if (!itens.length) return <p className="py-6 text-center text-sm text-white/50">Nenhuma resposta preenchida.</p>;
  return (
    <div className="space-y-2 rounded-xl border border-white/5 p-3" style={{ backgroundColor: "#0F0F0F" }}>
      {itens.map((item) => (
        <div key={item.chave} className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-white/40">{item.pergunta}</p>
          <p className="whitespace-pre-wrap text-xs text-white/85">{item.resposta}</p>
        </div>
      ))}
    </div>
  );
}
