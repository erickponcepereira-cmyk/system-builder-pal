import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, X, Loader2, Clock, Phone, Mail, Trash2, ArrowRight } from "lucide-react";

// As tabelas crm_* ainda não estão no types.ts gerado. Enquanto não regenerar,
// acessamos via cliente destipado — mesmo padrão já usado no projeto para
// tabelas novas (ex.: partner_product_orders com `as never`).
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export interface Coluna {
  id: string;
  nome: string;
  posicao: number;
  cor: string | null;
  tipo: "normal" | "ganho" | "perdido";
  limite_cartoes: number | null;
}

export interface Cartao {
  id: string;
  quadro_id: string;
  coluna_id: string;
  posicao: number;
  titulo: string;
  descricao: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  prioridade: "baixa" | "normal" | "alta";
  vence_em: string | null;
}

export interface Atividade {
  id: string;
  tipo: string;
  corpo: string | null;
  created_at: string;
  de_coluna_id: string | null;
  para_coluna_id: string | null;
}

const PRIORIDADE_COR: Record<string, string> = {
  alta: "text-red-400",
  normal: "text-white/40",
  baixa: "text-blue-400",
};

const TIPO_PONTO: Record<string, string> = {
  ganho: "bg-emerald-400",
  perdido: "bg-red-400",
  normal: "bg-white/20",
};

/** Funil padrão criado quando o quadro ainda não tem etapas. */
export const COLUNAS_PADRAO: Array<{ nome: string; tipo: Coluna["tipo"] }> = [
  { nome: "Novo contato", tipo: "normal" },
  { nome: "Contato feito", tipo: "normal" },
  { nome: "Aula experimental", tipo: "normal" },
  { nome: "Negociando", tipo: "normal" },
  { nome: "Matriculado", tipo: "ganho" },
  { nome: "Perdido", tipo: "perdido" },
];

export function CrmBoard({ quadroId }: { quadroId: string }) {
  const [colunas, setColunas] = useState<Coluna[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [novoEm, setNovoEm] = useState<string | null>(null);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [aberto, setAberto] = useState<Cartao | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [cRes, kRes] = await Promise.all([
      db.from("crm_colunas").select("*").eq("quadro_id", quadroId).order("posicao"),
      db.from("crm_cartoes").select("*").eq("quadro_id", quadroId).is("arquivado_em", null).order("posicao"),
    ]);
    if (cRes.error) toast.error("Não foi possível carregar as etapas");
    if (kRes.error) toast.error("Não foi possível carregar os cartões");
    setColunas((cRes.data || []) as Coluna[]);
    setCartoes((kRes.data || []) as Cartao[]);
    setCarregando(false);
  }, [quadroId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const daColuna = (colunaId: string) =>
    cartoes.filter((c) => c.coluna_id === colunaId).sort((a, b) => a.posicao - b.posicao);

  async function criarFunilPadrao() {
    const linhas = COLUNAS_PADRAO.map((c, i) => ({
      quadro_id: quadroId, nome: c.nome, tipo: c.tipo, posicao: (i + 1) * 1000,
    }));
    const { error } = await db.from("crm_colunas").insert(linhas);
    if (error) { toast.error("Não deu para criar as etapas"); return; }
    toast.success("Funil criado");
    void carregar();
  }

  async function adicionarCartao(colunaId: string) {
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    const atuais = daColuna(colunaId);
    const posicao = atuais.length ? Math.max(...atuais.map((c) => c.posicao)) + 1000 : 1000;
    const { data, error } = await db
      .from("crm_cartoes")
      .insert({ quadro_id: quadroId, coluna_id: colunaId, titulo, posicao })
      .select()
      .single();
    if (error) { toast.error("Não deu para criar o cartão"); return; }
    setCartoes((p) => [...p, data as Cartao]);
    setNovoTitulo("");
    setNovoEm(null);
  }

  /** Move o cartão. `antesDe` = id do cartão na frente do qual ele entra. */
  async function mover(cartaoId: string, colunaId: string, antesDe?: string) {
    const cartao = cartoes.find((c) => c.id === cartaoId);
    if (!cartao) return;
    const destino = daColuna(colunaId).filter((c) => c.id !== cartaoId);

    let posicao: number;
    if (antesDe) {
      const i = destino.findIndex((c) => c.id === antesDe);
      const anterior = i > 0 ? destino[i - 1].posicao : 0;
      const atual = destino[i]?.posicao ?? anterior + 2000;
      posicao = (anterior + atual) / 2;
    } else {
      posicao = destino.length ? Math.max(...destino.map((c) => c.posicao)) + 1000 : 1000;
    }

    const anteriores = cartoes;
    setCartoes((p) => p.map((c) => (c.id === cartaoId ? { ...c, coluna_id: colunaId, posicao } : c)));

    const { error } = await db.from("crm_cartoes").update({ coluna_id: colunaId, posicao }).eq("id", cartaoId);
    if (error) {
      setCartoes(anteriores);
      toast.error("Não deu para mover o cartão");
    }
  }

  async function arquivar(cartaoId: string) {
    const { error } = await db.from("crm_cartoes").update({ arquivado_em: new Date().toISOString() }).eq("id", cartaoId);
    if (error) { toast.error("Não deu para arquivar"); return; }
    setCartoes((p) => p.filter((c) => c.id !== cartaoId));
    setAberto(null);
    toast.success("Cartão arquivado");
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-white/50 py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando quadro…
      </div>
    );
  }

  if (!colunas.length) {
    return (
      <div className="rounded-2xl border border-white/5 p-10 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <p className="text-white font-medium mb-1">Este quadro ainda não tem etapas</p>
        <p className="text-sm text-white/50 mb-5">Comece com o funil padrão de academia e ajuste depois.</p>
        <button
          onClick={() => void criarFunilPadrao()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Criar funil padrão
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {colunas.map((coluna) => {
          const lista = daColuna(coluna.id);
          const cheia = coluna.limite_cartoes != null && lista.length >= coluna.limite_cartoes;
          return (
            <div
              key={coluna.id}
              onDragOver={(e) => { e.preventDefault(); setAlvo(coluna.id); }}
              onDragLeave={() => setAlvo((a) => (a === coluna.id ? null : a))}
              onDrop={(e) => {
                e.preventDefault();
                setAlvo(null);
                if (arrastando) void mover(arrastando, coluna.id);
                setArrastando(null);
              }}
              className={`w-72 shrink-0 rounded-2xl border p-3 transition-colors ${
                alvo === coluna.id ? "border-primary/40" : "border-white/5"
              }`}
              style={{ backgroundColor: "#151515" }}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${TIPO_PONTO[coluna.tipo]}`} />
                  <p className="text-sm font-medium text-white truncate">{coluna.nome}</p>
                </div>
                <span className={`text-xs shrink-0 ${cheia ? "text-red-400" : "text-white/40"}`}>
                  {lista.length}{coluna.limite_cartoes ? `/${coluna.limite_cartoes}` : ""}
                </span>
              </div>

              <div className="space-y-2">
                {lista.map((cartao) => (
                  <div
                    key={cartao.id}
                    draggable
                    onDragStart={() => setArrastando(cartao.id)}
                    onDragEnd={() => setArrastando(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAlvo(null);
                      if (arrastando && arrastando !== cartao.id) void mover(arrastando, coluna.id, cartao.id);
                      setArrastando(null);
                    }}
                    onClick={() => setAberto(cartao)}
                    className={`cursor-pointer rounded-xl border border-white/5 p-3 hover:border-white/15 ${
                      arrastando === cartao.id ? "opacity-40" : ""
                    }`}
                    style={{ backgroundColor: "#1F1F1F" }}
                  >
                    <p className="text-sm text-white leading-snug">{cartao.titulo}</p>
                    {(cartao.contato_nome || cartao.contato_telefone) && (
                      <p className="mt-1 text-xs text-white/40 truncate">
                        {cartao.contato_nome}
                        {cartao.contato_nome && cartao.contato_telefone ? " · " : ""}
                        {cartao.contato_telefone}
                      </p>
                    )}
                    {(cartao.prioridade !== "normal" || cartao.vence_em) && (
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        {cartao.prioridade !== "normal" && (
                          <span className={PRIORIDADE_COR[cartao.prioridade]}>{cartao.prioridade}</span>
                        )}
                        {cartao.vence_em && (
                          <span className="flex items-center gap-1 text-white/40">
                            <Clock className="h-3 w-3" />
                            {new Date(cartao.vence_em).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {novoEm === coluna.id ? (
                <div className="mt-2">
                  <textarea
                    autoFocus
                    value={novoTitulo}
                    onChange={(e) => setNovoTitulo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void adicionarCartao(coluna.id); }
                      if (e.key === "Escape") { setNovoEm(null); setNovoTitulo(""); }
                    }}
                    placeholder="Nome do contato ou o que precisa ser feito"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => void adicionarCartao(coluna.id)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    >
                      Adicionar
                    </button>
                    <button
                      onClick={() => { setNovoEm(null); setNovoTitulo(""); }}
                      className="text-white/40 hover:text-white"
                      aria-label="Cancelar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setNovoEm(coluna.id); setNovoTitulo(""); }}
                  className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-white/40 hover:bg-white/5 hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar cartão
                </button>
              )}
            </div>
          );
        })}
      </div>

      {aberto && (
        <DetalheCartao
          cartao={aberto}
          colunas={colunas}
          onFechar={() => setAberto(null)}
          onArquivar={() => void arquivar(aberto.id)}
          onSalvo={(c) => { setCartoes((p) => p.map((x) => (x.id === c.id ? c : x))); setAberto(c); }}
        />
      )}
    </>
  );
}

const ROTULO_ATIVIDADE: Record<string, string> = {
  comentario: "Comentário",
  mudanca_coluna: "Mudou de etapa",
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  visita: "Visita",
  tarefa: "Tarefa",
  sistema: "Sistema",
};

function DetalheCartao({
  cartao, colunas, onFechar, onArquivar, onSalvo,
}: {
  cartao: Cartao;
  colunas: Coluna[];
  onFechar: () => void;
  onArquivar: () => void;
  onSalvo: (c: Cartao) => void;
}) {
  const [form, setForm] = useState<Cartao>(cartao);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [comentario, setComentario] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setForm(cartao); }, [cartao]);

  const carregarAtividades = useCallback(async () => {
    const { data } = await db
      .from("crm_atividades").select("*").eq("cartao_id", cartao.id)
      .order("created_at", { ascending: false });
    setAtividades((data || []) as Atividade[]);
  }, [cartao.id]);

  useEffect(() => { void carregarAtividades(); }, [carregarAtividades]);

  async function salvar() {
    setSalvando(true);
    const { error } = await db.from("crm_cartoes").update({
      titulo: form.titulo,
      descricao: form.descricao,
      contato_nome: form.contato_nome,
      contato_telefone: form.contato_telefone,
      contato_email: form.contato_email,
      prioridade: form.prioridade,
      coluna_id: form.coluna_id,
    }).eq("id", cartao.id);
    setSalvando(false);
    if (error) { toast.error("Não deu para salvar"); return; }
    toast.success("Cartão salvo");
    onSalvo(form);
    void carregarAtividades();
  }

  async function registrar(tipo: string) {
    const corpo = comentario.trim();
    if (!corpo && tipo === "comentario") return;
    const { error } = await db.from("crm_atividades").insert({
      cartao_id: cartao.id, tipo, corpo: corpo || null,
    });
    if (error) { toast.error("Não deu para registrar"); return; }
    setComentario("");
    void carregarAtividades();
  }

  const nomeColuna = (id: string | null) => colunas.find((c) => c.id === id)?.nome || "—";
  const campo = "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/70 p-4 sm:p-8 overscroll-contain modal-safe items-start sm:items-center" onClick={onFechar}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10"
        style={{ backgroundColor: "#1A1A1A" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-white/5 p-5">
          <input
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="mr-4 w-full bg-transparent text-lg font-bold text-white focus:outline-none"
          />
          <button onClick={onFechar} className="shrink-0 text-white/40 hover:text-white" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-white/50">Etapa</label>
            <select
              value={form.coluna_id}
              onChange={(e) => setForm({ ...form, coluna_id: e.target.value })}
              className={campo}
            >
              {colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/50">Prioridade</label>
            <select
              value={form.prioridade}
              onChange={(e) => setForm({ ...form, prioridade: e.target.value as Cartao["prioridade"] })}
              className={campo}
            >
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/50">Nome do contato</label>
            <input value={form.contato_nome || ""} onChange={(e) => setForm({ ...form, contato_nome: e.target.value })} className={campo} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/50">Telefone</label>
            <input value={form.contato_telefone || ""} onChange={(e) => setForm({ ...form, contato_telefone: e.target.value })} className={campo} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-white/50">E-mail</label>
            <input value={form.contato_email || ""} onChange={(e) => setForm({ ...form, contato_email: e.target.value })} className={campo} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-white/50">Observações</label>
            <textarea rows={3} value={form.descricao || ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className={`${campo} resize-none`} />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-white/5 px-5 py-4">
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
          <button onClick={onArquivar} className="ml-auto inline-flex items-center gap-2 text-sm text-white/40 hover:text-red-400">
            <Trash2 className="h-4 w-4" /> Arquivar
          </button>
        </div>

        <div className="border-t border-white/5 p-5">
          <p className="mb-3 text-sm font-medium text-white">Histórico</p>

          <textarea
            rows={2}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="O que aconteceu nesse contato?"
            className={`${campo} resize-none`}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => void registrar("comentario")} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15">
              Comentar
            </button>
            <button onClick={() => void registrar("ligacao")} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">
              <Phone className="h-3 w-3" /> Liguei
            </button>
            <button onClick={() => void registrar("whatsapp")} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10">
              <Mail className="h-3 w-3" /> Mandei WhatsApp
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {!atividades.length && <p className="text-xs text-white/30">Nada registrado ainda.</p>}
            {atividades.map((a) => (
              <div key={a.id} className="flex gap-3 text-xs">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
                <div className="min-w-0">
                  <p className="text-white/70">
                    {ROTULO_ATIVIDADE[a.tipo] || a.tipo}
                    {a.tipo === "mudanca_coluna" && (
                      <span className="text-white/40">
                        {" "}: {nomeColuna(a.de_coluna_id)} <ArrowRight className="inline h-3 w-3" /> {nomeColuna(a.para_coluna_id)}
                      </span>
                    )}
                  </p>
                  {a.corpo && <p className="mt-0.5 text-white/50">{a.corpo}</p>}
                  <p className="mt-0.5 text-white/25">{new Date(a.created_at).toLocaleString("pt-BR")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
