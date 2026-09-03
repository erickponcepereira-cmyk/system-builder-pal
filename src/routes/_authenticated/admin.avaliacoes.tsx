import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare, ShieldCheck, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StarRating } from "@/components/store/StarRating";

export const Route = createFileRoute("/_authenticated/admin/avaliacoes")({ component: AdminAvaliacoes });

const quando = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

const ORIGEM: Record<string, string> = {
  fitmind: "FitMind",
  partner: "Parceiro",
  professional: "Profissional",
  course: "Curso",
};

type Linha = {
  id: string;
  product_origin: string;
  produto: string;
  rating: number;
  comment: string | null;
  seller_reply: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  created_at: string;
  autor: string;
};

/**
 * Moderar avaliação.
 *
 * Esta tela continua sendo a visão editorial e o lugar para responder. Ações
 * de remoção ficam na fila unificada de denúncias, onde geram histórico,
 * recurso e restauração controlada.
 */
function AdminAvaliacoes() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Record<string, string>>({});

  const carregar = useCallback(() => {
    setCarregando(true);
    void supabase
      .rpc("avaliacoes_para_moderar" as never, { _incluir_escondidas: true } as never)
      .then(({ data, error }) => {
        if (error) {
          console.error("[admin-avaliacoes]", error);
          toast.error("Não consegui carregar as avaliações.");
        }
        setLinhas(((data as unknown as Linha[]) || []));
        setCarregando(false);
      });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const responder = async (l: Linha) => {
    const texto = (respostas[l.id] || "").trim();
    if (!texto) { toast.error("Escreva a resposta."); return; }
    setSalvando(l.id);
    const { error } = await supabase.rpc("responder_avaliacao" as never, {
      _id: l.id, _resposta: texto,
    } as never);
    setSalvando(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Resposta publicada.");
    setRespostas((d) => ({ ...d, [l.id]: "" }));
    carregar();
  };

  const escondidas = linhas.filter((l) => l.hidden_at).length;

  return (
    <div className="flex flex-col gap-4 p-4 pb-10 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Star className="h-5 w-5 text-primary" /> Avaliações
          </h1>
          <p className="text-xs text-muted-foreground">
            {linhas.length} no total{escondidas > 0 ? `, ${escondidas} escondida${escondidas > 1 ? "s" : ""} da vitrine` : ""}.
          </p>
        </div>
        <Link
          to="/admin/moderation"
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-card px-3 py-2 text-[11px] font-bold text-foreground"
        >
          <ShieldCheck className="h-3.5 w-3.5" /> Denúncias e recursos
        </Link>
      </header>

      {carregando ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : linhas.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-card p-6 text-center text-sm text-muted-foreground">
          Ninguém avaliou nada ainda. O convite aparece em “Minhas compras”, para quem já comprou.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {linhas.map((l) => (
            <article
              key={l.id}
              className={`rounded-2xl border p-4 ${l.hidden_at ? "border-amber-500/40 bg-amber-500/5" : "border-white/10 bg-card"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{l.produto}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {ORIGEM[l.product_origin] ?? l.product_origin} · {l.autor} · {quando(l.created_at)}
                  </p>
                </div>
                <StarRating nota={l.rating} />
              </div>

              {l.comment && (
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                  {l.comment}
                </p>
              )}

              {l.hidden_at && (
                <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-500">
                  Escondida em {quando(l.hidden_at)} — {l.hidden_reason}
                </p>
              )}

              {l.seller_reply && (
                <div className="mt-2 rounded-lg border-l-2 border-primary/40 bg-muted/20 py-2 pl-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Resposta do vendedor</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-muted-foreground">{l.seller_reply}</p>
                </div>
              )}

              {!l.hidden_at && (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={respostas[l.id] || ""}
                      onChange={(e) => setRespostas((d) => ({ ...d, [l.id]: e.target.value }))}
                      placeholder={l.seller_reply ? "Corrigir a resposta do vendedor" : "Responder como o vendedor"}
                      className="min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <button
                      type="button"
                      disabled={salvando === l.id}
                      onClick={() => responder(l)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-background px-3 py-2 text-[11px] font-bold text-foreground disabled:opacity-40"
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> Publicar
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminAvaliacoes;
