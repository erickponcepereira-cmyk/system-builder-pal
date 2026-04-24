import { useState, useMemo } from "react";
import {
  Plus, Trash2, Users, TrendingUp, Package,
  Edit3, Check, X, Network, BarChart3, Info, ChevronDown, ChevronRight,
} from "lucide-react";

// ─── CONSTANTES FIXAS ────────────────────────────────────────────────
const TAXA_MAQ_PERC = 3.49;
const TAXA_IMP_EMP_PERC = 6.0;
const TAXA_SISTEMA_R = 20;
const TAXA_IMP_PESSOA = 6.0;
const REDE_PERCS = [10, 5, 3]; // N1, N2, N3

// ─── PRODUTOS BASE ──────────────────────────────────────────────────
const PRODUTOS_BASE = [
  { id: "p1", nome: "Workshop Online", preco: 85 },
  { id: "p2", nome: "Sessão Individual", preco: 100 },
  { id: "p3", nome: "Pacote Mensal", preco: 350 },
  { id: "p4", nome: "Programa Trimestral", preco: 900 },
  { id: "p5", nome: "Mentoria Anual", preco: 2400 },
];

// ─── HELPERS ────────────────────────────────────────────────────────
const fmt = (v: number) =>
  "R$ " + Math.abs(+v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fmtp = (v: number) => (+v).toFixed(2).replace(".", ",") + "%";

let _uid = 0;
const uid = () => `nd_${++_uid}_${Date.now()}`;

type NodeT = { id: string; nome: string; vendas: number; parentId: string | null };
type NodesMap = Record<string, NodeT>;
type ProdutoT = { id: string; nome: string; preco: number };

// ─── ENGINE DE CÁLCULO ──────────────────────────────────────────────
function calcVenda(preco: number) {
  const maq = +(preco * TAXA_MAQ_PERC / 100).toFixed(2);
  const impEmp = +(preco * TAXA_IMP_EMP_PERC / 100).toFixed(2);
  const liquido = +(Math.max(0, preco - maq - impEmp - TAXA_SISTEMA_R)).toFixed(2);
  return { maq, impEmp, sistema: TAXA_SISTEMA_R, liquido };
}

function calcLiqPessoa(bruto: number) {
  const imp = +(bruto * TAXA_IMP_PESSOA / 100).toFixed(2);
  const liquido = +(bruto - imp).toFixed(2);
  return { bruto, imp, liquido };
}

function getNivel(nodes: NodesMap, id: string): number {
  let nivel = 0;
  let cur: NodeT | undefined = nodes[id];
  while (cur && cur.parentId) {
    nivel++;
    cur = nodes[cur.parentId];
  }
  return nivel;
}

function getFilhos(nodes: NodesMap, parentId: string | null) {
  return Object.values(nodes).filter((n) => n.parentId === parentId);
}

function getN1(nodes: NodesMap) {
  return Object.values(nodes).filter((n) => n.parentId === null);
}

function calcGanhosRede(nodes: NodesMap, liquidoVenda: number) {
  let totalBruto = 0;
  const detalhes: { id: string; nome: string; nivel: number; perc: number; bruto: number; vendas: number }[] = [];

  Object.values(nodes).forEach((node) => {
    const nivel = getNivel(nodes, node.id);
    if (nivel >= REDE_PERCS.length) return;
    const perc = REDE_PERCS[nivel];
    const bruto = +(liquidoVenda * perc / 100 * node.vendas).toFixed(2);
    totalBruto += bruto;
    detalhes.push({ id: node.id, nome: node.nome, nivel, perc, bruto, vendas: node.vendas });
  });

  const { imp, liquido } = calcLiqPessoa(totalBruto);
  return { totalBruto: +totalBruto.toFixed(2), imp, liquido, detalhes };
}

function calcVendaPropria(nodes: NodesMap, liquidoVenda: number) {
  const todos = Object.values(nodes);
  const n1Existe = todos.some((n) => n.parentId === null);
  const n2Existe = todos.some((n) => n.parentId !== null && getNivel(nodes, n.id) === 1);
  const n3Existe = todos.some((n) => getNivel(nodes, n.id) === 2);

  const existe = [n1Existe, n2Existe, n3Existe];
  let retorno = 0;
  REDE_PERCS.forEach((p, i) => { if (!existe[i]) retorno += p; });

  const coachPerc = 100 - REDE_PERCS.reduce((a, b) => a + b, 0) + retorno;
  const bruto = +(liquidoVenda * coachPerc / 100).toFixed(2);
  return { ...calcLiqPessoa(bruto), perc: coachPerc, retorno };
}

// ─── CORES POR NÍVEL ────────────────────────────────────────────────
const COR = [
  { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/30", dot: "bg-violet-500" },
  { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-500" },
  { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", dot: "bg-amber-500" },
];

function NivelBadge({ nivel }: { nivel: number }) {
  const c = COR[nivel];
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      N{nivel + 1}
    </span>
  );
}

// ─── NODO DA ÁRVORE ─────────────────────────────────────────────────
function NodoArvore({
  nodeId, nodes, setNodes, nivel,
}: {
  nodeId: string;
  nodes: NodesMap;
  setNodes: React.Dispatch<React.SetStateAction<NodesMap>>;
  nivel: number;
}) {
  const node = nodes[nodeId];
  const [editando, setEditando] = useState(false);
  const [nomeTemp, setNomeTemp] = useState("");
  const [expandido, setExpandido] = useState(true);

  if (!node) return null;

  const filhos = getFilhos(nodes, nodeId);
  const cor = COR[Math.min(nivel, 2)];
  const podeAdd = nivel < 2;

  const salvarNome = () => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], nome: nomeTemp.trim() || prev[nodeId].nome },
    }));
    setEditando(false);
  };

  const alterarVendas = (delta: number) => {
    setNodes((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], vendas: Math.max(1, prev[nodeId].vendas + delta) },
    }));
  };

  const adicionarFilho = () => {
    const novoId = uid();
    setNodes((prev) => {
      const count = Object.keys(prev).length + 1;
      return {
        ...prev,
        [novoId]: { id: novoId, nome: `Membro ${count}`, vendas: 1, parentId: nodeId },
      };
    });
    setExpandido(true);
  };

  const deletarNodo = () => {
    setNodes((prev) => {
      const next = { ...prev };
      const remover = (id: string) => {
        Object.values(next).filter((n) => n.parentId === id).forEach((f) => remover(f.id));
        delete next[id];
      };
      remover(nodeId);
      return next;
    });
  };

  return (
    <div>
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-2 ${cor.bg} ${cor.border}`}>
        <button
          onClick={() => filhos.length > 0 && setExpandido((e) => !e)}
          className={`flex-shrink-0 w-5 flex items-center justify-center ${cor.text} ${filhos.length === 0 ? "opacity-0 pointer-events-none" : ""}`}
        >
          {expandido ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {editando ? (
          <input
            autoFocus
            value={nomeTemp}
            onChange={(e) => setNomeTemp(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") salvarNome(); if (e.key === "Escape") setEditando(false); }}
            className="flex-1 bg-transparent border-b border-white/30 text-sm text-zinc-100 outline-none min-w-0"
          />
        ) : (
          <span className={`flex-1 text-sm font-medium truncate min-w-0 ${cor.text}`}>{node.nome}</span>
        )}

        <NivelBadge nivel={nivel} />

        <div className="flex items-center gap-0.5 bg-black/25 rounded-lg px-1.5 py-0.5 flex-shrink-0">
          <button onClick={() => alterarVendas(-1)} className="text-zinc-400 hover:text-zinc-200 w-5 h-5 flex items-center justify-center text-base leading-none select-none">−</button>
          <span className="text-xs font-bold text-zinc-200 w-5 text-center">{node.vendas}</span>
          <button onClick={() => alterarVendas(+1)} className="text-zinc-400 hover:text-zinc-200 w-5 h-5 flex items-center justify-center text-base leading-none select-none">+</button>
          <span className="text-xs text-zinc-500 ml-0.5">vnd</span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {editando ? (
            <>
              <button onClick={salvarNome} className="text-emerald-400 hover:text-emerald-300 p-0.5"><Check size={13} /></button>
              <button onClick={() => setEditando(false)} className="text-zinc-500 hover:text-zinc-300 p-0.5"><X size={13} /></button>
            </>
          ) : (
            <button
              onClick={() => { setNomeTemp(node.nome); setEditando(true); }}
              className="text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <Edit3 size={12} />
            </button>
          )}

          {podeAdd && (
            <button
              onClick={adicionarFilho}
              title={`Adicionar N${nivel + 2} abaixo de ${node.nome}`}
              className={`p-0.5 rounded transition-all ${cor.text} opacity-70 hover:opacity-100`}
            >
              <Plus size={13} />
            </button>
          )}

          <button onClick={deletarNodo} className="text-zinc-600 hover:text-red-400 transition-colors p-0.5">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {expandido && filhos.length > 0 && (
        <div className="ml-5 pl-3 border-l border-white/10 mb-1">
          {filhos.map((filho) => (
            <NodoArvore
              key={filho.id}
              nodeId={filho.id}
              nodes={nodes}
              setNodes={setNodes}
              nivel={nivel + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ABA PRODUTO ────────────────────────────────────────────────────
function AbaProduto({
  produtoId, setProdutoId, preco, setPreco, produtos, setProdutos,
}: {
  produtoId: string;
  setProdutoId: (id: string) => void;
  preco: number;
  setPreco: (v: number) => void;
  produtos: ProdutoT[];
  setProdutos: React.Dispatch<React.SetStateAction<ProdutoT[]>>;
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeTemp, setNomeTemp] = useState("");
  const { maq, impEmp, sistema, liquido } = calcVenda(preco);

  const selecionar = (p: ProdutoT) => { setProdutoId(p.id); setPreco(p.preco); };

  const salvarNome = (id: string) => {
    setProdutos((ps) => ps.map((p) => p.id === id ? { ...p, nome: nomeTemp.trim() || p.nome } : p));
    setEditandoId(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Selecionar produto</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {produtos.map((p) => (
            <button
              key={p.id}
              onClick={() => selecionar(p)}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
                produtoId === p.id
                  ? "border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_14px_rgba(16,185,129,0.1)]"
                  : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${produtoId === p.id ? "bg-emerald-400" : "bg-zinc-600"}`} />
                {editandoId === p.id ? (
                  <input
                    autoFocus
                    value={nomeTemp}
                    onChange={(e) => setNomeTemp(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") salvarNome(p.id); if (e.key === "Escape") setEditandoId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-transparent border-b border-emerald-400 text-sm text-zinc-100 outline-none w-full"
                  />
                ) : (
                  <span className="text-sm text-zinc-200 truncate">{p.nome}</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-sm font-semibold text-zinc-300">{fmt(p.preco)}</span>
                {editandoId === p.id ? (
                  <button onClick={(e) => { e.stopPropagation(); salvarNome(p.id); }} className="text-emerald-400"><Check size={13} /></button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditandoId(p.id); setNomeTemp(p.nome); }}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    <Edit3 size={12} />
                  </button>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">Simular preço de venda</p>
        <div className="flex items-center gap-3 mb-2">
          <input
            type="range" min={10} max={5000} step={5} value={preco}
            onChange={(e) => setPreco(+e.target.value)}
            className="flex-1 accent-emerald-500 cursor-pointer"
          />
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
            <span className="text-zinc-500 text-sm">R$</span>
            <input
              type="number" min={10} max={99999} step={1} value={preco}
              onChange={(e) => { const v = +e.target.value; if (v > 0) setPreco(v); }}
              className="w-20 bg-transparent text-zinc-100 text-sm font-bold outline-none text-right"
            />
          </div>
        </div>
        <div className="flex justify-between text-xs text-zinc-600"><span>R$ 10</span><span>R$ 5.000</span></div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">Composição por venda</p>
        {[
          { label: "Valor do produto", val: fmt(preco), neg: false },
          { label: `(-) Maquininha ${fmtp(TAXA_MAQ_PERC)}`, val: `- ${fmt(maq)}`, neg: true },
          { label: `(-) Imposto empresa ${fmtp(TAXA_IMP_EMP_PERC)}`, val: `- ${fmt(impEmp)}`, neg: true },
          { label: "(-) Taxa da plataforma", val: `- ${fmt(sistema)}`, neg: true },
        ].map((r) => (
          <div key={r.label} className="flex justify-between py-1.5 border-b border-white/5 text-sm">
            <span className="text-zinc-400">{r.label}</span>
            <span className={r.neg ? "text-red-400 font-medium" : "text-zinc-200"}>{r.val}</span>
          </div>
        ))}
        <div className="flex justify-between pt-3 mt-1 text-sm font-bold">
          <span className="text-zinc-300">Líquido distribuível</span>
          <span className="text-emerald-400">{fmt(liquido)}</span>
        </div>
        <p className="text-xs text-zinc-600 mt-3 flex items-center gap-1.5"><Info size={11} /> Taxas fixas do sistema — não editáveis</p>
      </div>
    </div>
  );
}

// ─── ABA REDE ───────────────────────────────────────────────────────
function AbaRede({
  nodes, setNodes,
}: {
  nodes: NodesMap;
  setNodes: React.Dispatch<React.SetStateAction<NodesMap>>;
}) {
  const todos = Object.values(nodes);
  const n1Nodes = getN1(nodes);
  const n1count = todos.filter((n) => getNivel(nodes, n.id) === 0).length;
  const n2count = todos.filter((n) => getNivel(nodes, n.id) === 1).length;
  const n3count = todos.filter((n) => getNivel(nodes, n.id) === 2).length;

  const adicionarN1 = () => {
    const id = uid();
    setNodes((prev) => {
      const count = Object.keys(prev).length + 1;
      return { ...prev, [id]: { id, nome: `Membro ${count}`, vendas: 1, parentId: null } };
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total", val: todos.length, cor: "text-zinc-200" },
          { label: "N1", val: n1count, cor: "text-violet-400" },
          { label: "N2", val: n2count, cor: "text-emerald-400" },
          { label: "N3", val: n3count, cor: "text-amber-400" },
        ].map((s) => (
          <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <div className={`text-2xl font-bold ${s.cor}`}>{s.val}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        {[
          { nivel: 0, label: "N1 — indicação direta (10%)" },
          { nivel: 1, label: "N2 — abaixo do N1 (5%)" },
          { nivel: 2, label: "N3 — abaixo do N2 (3%)" },
        ].map((l) => (
          <div key={l.nivel} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${COR[l.nivel].dot}`} />
            <span className="text-zinc-400">{l.label}</span>
          </div>
        ))}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500/15 to-transparent border border-emerald-500/30 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs font-bold flex-shrink-0">
              EU
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-400">Você — Coach Principal</p>
              <p className="text-xs text-zinc-500">Clique no <b className="text-zinc-400">+</b> ao lado de cada membro para adicionar quem está abaixo</p>
            </div>
          </div>
          <button
            onClick={adicionarN1}
            className="flex items-center gap-1.5 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ml-3"
          >
            <Plus size={12} /> Add N1
          </button>
        </div>

        {n1Nodes.length === 0 ? (
          <div className="text-center py-10">
            <Users size={32} className="text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">Nenhum membro ainda</p>
            <p className="text-zinc-600 text-xs mt-1">Clique em "Add N1" para começar</p>
          </div>
        ) : (
          <div>
            {n1Nodes.map((n) => (
              <NodoArvore
                key={n.id}
                nodeId={n.id}
                nodes={nodes}
                setNodes={setNodes}
                nivel={0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ABA GANHOS ─────────────────────────────────────────────────────
function AbaGanhos({ nodes, preco }: { nodes: NodesMap; preco: number }) {
  const { liquido: liqVenda } = calcVenda(preco);
  const ganhoRede = useMemo(() => calcGanhosRede(nodes, liqVenda), [nodes, liqVenda]);
  const ganhoPropr = useMemo(() => calcVendaPropria(nodes, liqVenda), [nodes, liqVenda]);
  const totalLiq = +(ganhoRede.liquido + ganhoPropr.liquido).toFixed(2);
  const vendasRede = Object.values(nodes).reduce((a, n) => a + n.vendas, 0);
  const porNivel = [0, 1, 2].map((n) => ganhoRede.detalhes.filter((d) => d.nivel === n));

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/30 rounded-2xl p-5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1">Ganho líquido total estimado</p>
        <p className="text-4xl font-bold text-emerald-400 tracking-tight">{fmt(totalLiq)}</p>
        <p className="text-sm text-zinc-500 mt-1">produto: {fmt(preco)} · {vendasRede} venda{vendasRede !== 1 ? "s" : ""} na rede</p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-black/20 rounded-xl p-3">
            <p className="text-xs text-zinc-500 mb-1">Sua venda (líquido)</p>
            <p className="text-xl font-bold text-violet-400">{fmt(ganhoPropr.liquido)}</p>
            <p className="text-xs text-zinc-600 mt-0.5">{ganhoPropr.perc}% do líquido distrib.</p>
          </div>
          <div className="bg-black/20 rounded-xl p-3">
            <p className="text-xs text-zinc-500 mb-1">Comissão rede (líquido)</p>
            <p className="text-xl font-bold text-amber-400">{fmt(ganhoRede.liquido)}</p>
            <p className="text-xs text-zinc-600 mt-0.5">{vendasRede} venda{vendasRede !== 1 ? "s" : ""} na rede</p>
          </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Sua venda direta (por unidade)</p>
        {([
          { label: `Bruto (${ganhoPropr.perc}% do líquido distrib.)`, val: fmt(ganhoPropr.bruto), style: "text-zinc-200" },
          ganhoPropr.retorno > 0 ? { label: `(+) Níveis vazios devolvidos +${ganhoPropr.retorno}%`, val: fmt(+(liqVenda * ganhoPropr.retorno / 100).toFixed(2)), style: "text-emerald-400 font-medium" } : null,
          { label: `(-) Imposto pessoal ${fmtp(TAXA_IMP_PESSOA)}`, val: `- ${fmt(ganhoPropr.imp)}`, style: "text-red-400" },
        ].filter(Boolean) as { label: string; val: string; style: string }[]).map((r, i) => (
          <div key={i} className="flex justify-between py-1.5 border-b border-white/5 text-sm">
            <span className="text-zinc-400">{r.label}</span>
            <span className={r.style}>{r.val}</span>
          </div>
        ))}
        <div className="flex justify-between pt-3 mt-1 text-sm font-bold">
          <span className="text-zinc-300">Líquido real por venda</span>
          <span className="text-violet-400">{fmt(ganhoPropr.liquido)}</span>
        </div>
      </div>

      {ganhoRede.detalhes.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Comissão de rede por nível</p>
          {[0, 1, 2].map((ni) => {
            const grupo = porNivel[ni];
            if (!grupo.length) return null;
            const cor = COR[ni];
            const total = +grupo.reduce((a, d) => a + d.bruto, 0).toFixed(2);
            return (
              <div key={ni} className={`mb-3 rounded-xl border p-3 ${cor.bg} ${cor.border}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <NivelBadge nivel={ni} />
                    <span className={`text-sm font-semibold ${cor.text}`}>
                      {grupo.length} membro{grupo.length !== 1 ? "s" : ""} · {REDE_PERCS[ni]}%
                    </span>
                  </div>
                  <span className={`text-sm font-bold ${cor.text}`}>{fmt(total)}</span>
                </div>
                <div className="space-y-1">
                  {grupo.map((d) => (
                    <div key={d.id} className="flex justify-between text-xs text-zinc-400">
                      <span className="truncate mr-2">{d.nome}</span>
                      <span className="flex-shrink-0">{d.vendas} × {fmt(+(liqVenda * d.perc / 100).toFixed(2))} = <b>{fmt(d.bruto)}</b></span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="space-y-1 mt-3 pt-3 border-t border-white/10">
            {[
              { label: "Total bruto da rede", val: fmt(ganhoRede.totalBruto), style: "text-zinc-200" },
              { label: `(-) Imposto pessoal ${fmtp(TAXA_IMP_PESSOA)}`, val: `- ${fmt(ganhoRede.imp)}`, style: "text-red-400" },
              { label: "Líquido real da rede", val: fmt(ganhoRede.liquido), style: "text-amber-400 font-bold" },
            ].map((r, i) => (
              <div key={i} className={`flex justify-between py-1 text-sm ${i === 2 ? "pt-2 border-t border-white/10 font-bold" : ""}`}>
                <span className="text-zinc-400">{r.label}</span>
                <span className={r.style}>{r.val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(nodes).length === 0 && (
        <div className="border border-dashed border-white/10 rounded-2xl p-8 text-center">
          <Network size={28} className="text-zinc-700 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm">Nenhum membro na rede ainda</p>
          <p className="text-zinc-600 text-xs mt-1">Vá para "Minha Rede" e adicione membros</p>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <p className="text-xs font-semibold text-zinc-600 uppercase tracking-widest mb-3">Taxas fixas aplicadas</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-zinc-500">
          {[
            ["Maquininha", fmtp(TAXA_MAQ_PERC)],
            ["Imposto empresa", fmtp(TAXA_IMP_EMP_PERC)],
            ["Taxa plataforma", `R$ ${TAXA_SISTEMA_R}`],
            ["Imposto pessoal", fmtp(TAXA_IMP_PESSOA)],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between">
              <span>{l}</span><span className="font-medium text-zinc-400">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────────
export function MinhaRede() {
  const [abaAtiva, setAbaAtiva] = useState<"produto" | "rede" | "ganhos">("rede");
  const [produtos, setProdutos] = useState<ProdutoT[]>(PRODUTOS_BASE.map((p) => ({ ...p })));
  const [produtoId, setProdutoId] = useState("p2");
  const [preco, setPreco] = useState(100);
  const [nodes, setNodes] = useState<NodesMap>({});

  const abas = [
    { id: "produto" as const, label: "Produto", icon: Package },
    { id: "rede" as const, label: "Minha Rede", icon: Network },
    { id: "ganhos" as const, label: "Ganhos", icon: TrendingUp },
  ];

  return (
    <div className="text-zinc-100">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
          <BarChart3 size={20} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Simulador de rede</h2>
          <p className="text-xs text-zinc-500">Monte sua equipe e simule ganhos por nível</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl mb-6">
        {abas.map((aba) => {
          const Icon = aba.icon;
          const ativo = abaAtiva === aba.id;
          return (
            <button
              key={aba.id}
              onClick={() => setAbaAtiva(aba.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                ativo
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon size={15} />
              <span>{aba.label}</span>
            </button>
          );
        })}
      </div>

      {abaAtiva === "produto" && (
        <AbaProduto
          produtoId={produtoId} setProdutoId={setProdutoId}
          preco={preco} setPreco={setPreco}
          produtos={produtos} setProdutos={setProdutos}
        />
      )}
      {abaAtiva === "rede" && <AbaRede nodes={nodes} setNodes={setNodes} />}
      {abaAtiva === "ganhos" && <AbaGanhos nodes={nodes} preco={preco} />}
    </div>
  );
}
