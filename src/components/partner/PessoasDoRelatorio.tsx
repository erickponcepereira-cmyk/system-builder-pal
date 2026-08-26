import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessageCircle, Search, X } from "lucide-react";
import { pessoasDoRelatorio, type CategoriaRelatorio } from "@/lib/academia-teste.functions";

type Pessoa = {
  nome: string; telefone: string | null; referencia: string | null;
  student_id: string | null; credencial_id: string | null;
  valido_ate: string | null; dias: number | null; detalhe: string | null;
};

const soDigitos = (s: string) => s.replace(/\D/g, "");

/** Número no formato que o WhatsApp aceita, com o 55 na frente. */
const linkWhatsapp = (tel: string) => {
  const d = soDigitos(tel);
  return `https://wa.me/${d.startsWith("55") ? d : `55${d}`}`;
};

/**
 * A lista por trás de um número do relatório.
 *
 * Cada cartão do painel é um recorte de gente real — "274 bloqueados" só vira
 * trabalho quando dá para ver quem são e falar com eles. Por isso a linha traz
 * o telefone com link direto: da contagem à conversa em dois cliques.
 */
export function PessoasDoRelatorio({
  partnerId, categoria, titulo, de, ate, aoFechar,
}: {
  partnerId: string;
  categoria: CategoriaRelatorio;
  titulo: string;
  de: string;
  ate: string;
  aoFechar: () => void;
}) {
  const obter = useServerFn(pessoasDoRelatorio);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    obter({ data: { partnerId, categoria, de, ate } })
      .then((r) => { if (vivo) setPessoas(r.pessoas); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Não consegui carregar a lista."))
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [partnerId, categoria, de, ate]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return pessoas;
    return pessoas.filter((p) =>
      p.nome.toLowerCase().includes(t) || (p.referencia ?? "").includes(t));
  }, [pessoas, busca]);

  const comTelefone = pessoas.filter((p) => p.telefone).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={aoFechar}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-white/10 bg-[#141414] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-white/10 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{titulo}</p>
            <p className="text-[11px] text-white/50">
              {carregando ? "carregando…" : `${pessoas.length} pessoa(s) · ${comTelefone} com telefone`}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {pessoas.length > 8 && (
          <div className="relative border-b border-white/10 p-2">
            <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar por nome ou identificador"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-2 text-sm text-white placeholder:text-white/40"
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {carregando ? (
            <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin text-primary" />
          ) : visiveis.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/50">
              {pessoas.length === 0 ? "Ninguém nesta situação." : "Ninguém com esse nome."}
            </p>
          ) : (
            <div className="space-y-1">
              {visiveis.map((p, i) => (
                <div
                  key={`${p.credencial_id ?? p.student_id ?? p.referencia ?? i}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{p.nome}</p>
                    <p className="truncate text-[11px] text-white/50">
                      {p.referencia && <span className="font-mono">id {p.referencia}</span>}
                      {p.referencia && p.detalhe ? " · " : ""}
                      {p.detalhe}
                    </p>
                  </div>
                  {p.telefone ? (
                    <a
                      href={linkWhatsapp(p.telefone)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Falar com ${p.nome} no WhatsApp`}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25"
                    >
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </a>
                  ) : (
                    <span className="shrink-0 text-[10px] text-white/30">sem telefone</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
