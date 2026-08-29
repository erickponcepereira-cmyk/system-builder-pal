import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BadgeCheck, Instagram, Globe, Loader2, MapPin, PackageOpen, Star,
} from "lucide-react";
import {
  carregarReputacao, carregarVendedor, tempoDeCasa,
  type Reputacao, type TipoDeVendedor, type Vendedor,
} from "@/lib/store-seller";
import { loadUnifiedCatalog, type UnifiedProduct } from "@/lib/unified-store";
import { StarRating } from "@/components/store/StarRating";

export const Route = createFileRoute("/_authenticated/student/vendedor/$tipo/$id")({
  component: PaginaDoVendedor,
});

const dinheiro = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * A página de um vendedor: quem é, dá para confiar, e o que mais ele vende.
 *
 * O marketplace tinha 37 vendedores e nenhuma forma de olhar para nenhum
 * deles. O nome aparecia no card e morria ali — não dava para saber se a
 * empresa existe há três anos ou entrou ontem, nem ver o resto do catálogo
 * dela.
 *
 * Os sinais de confiança são deliberadamente poucos e verificáveis: há quanto
 * tempo vende, quantos produtos, quantas vendas concluídas e a nota de quem
 * comprou. Nada de selo inventado.
 */
function PaginaDoVendedor() {
  const { tipo, id } = useParams({ from: "/_authenticated/student/vendedor/$tipo/$id" });
  const navigate = useNavigate();

  const [vendedor, setVendedor] = useState<Vendedor | null>(null);
  const [reputacao, setReputacao] = useState<Reputacao | null>(null);
  const [produtos, setProdutos] = useState<UnifiedProduct[]>([]);
  const [carregando, setCarregando] = useState(true);

  const tipoValido: TipoDeVendedor | null =
    tipo === "partner" || tipo === "professional" ? tipo : null;

  useEffect(() => {
    if (!tipoValido) { setCarregando(false); return; }
    let vivo = true;
    setCarregando(true);

    void Promise.all([
      carregarVendedor(tipoValido, id),
      carregarReputacao(tipoValido, id),
      loadUnifiedCatalog({}),
    ]).then(([v, r, catalogo]) => {
      if (!vivo) return;
      setVendedor(v);
      setReputacao(r);
      setProdutos((catalogo?.products ?? []).filter((p) => p.sellerId === id));
      setCarregando(false);
    }).catch((e: unknown) => {
      console.error("[vendedor]", e);
      if (vivo) setCarregando(false);
    });

    return () => { vivo = false; };
  }, [tipoValido, id]);

  const gratuitos = useMemo(() => produtos.filter((p) => p.isFreebie).length, [produtos]);

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vendedor) {
    return (
      <div className="p-4">
        <button
          type="button"
          onClick={() => navigate({ to: "/student/store" })}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para a loja
        </button>
        <p className="rounded-2xl border border-white/10 bg-card p-6 text-center text-sm text-muted-foreground">
          Este vendedor não está mais disponível.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* Capa. Sem imagem, uma faixa de cor — o cabeçalho precisa de altura
          para o avatar não colar no topo da tela. */}
      <div className="relative h-28 w-full bg-gradient-to-br from-primary/30 to-primary/5">
        {vendedor.capa && (
          <img src={vendedor.capa} alt="" className="h-full w-full object-cover" />
        )}
        <button
          type="button"
          onClick={() => navigate({ to: "/student/store" })}
          aria-label="Voltar para a loja"
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
      </div>

      <div className="px-4">
        <div className="-mt-10 flex items-end gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-background bg-card">
            {vendedor.foto ? (
              <img src={vendedor.foto} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                {vendedor.nome.charAt(0)}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3">
          <h1 className="flex items-center gap-1.5 text-xl font-bold text-foreground">
            {vendedor.nome}
            {vendedor.aprovado && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Vendedor aprovado" />
            )}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {(vendedor.cidade || vendedor.uf) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[vendedor.cidade, vendedor.uf].filter(Boolean).join(" · ")}
              </span>
            )}
            <span>{tempoDeCasa(vendedor.desde)}</span>
            {vendedor.ramo && <span>{vendedor.ramo}</span>}
          </p>
        </div>

        {vendedor.descricao && (
          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
            {vendedor.descricao}
          </p>
        )}

        {/* Os números que sustentam a confiança. Todos verificáveis: saem de
            pedido pago e de avaliação de quem comprou. */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Numero rotulo="produtos" valor={String(reputacao?.produtos ?? produtos.length)} />
          <Numero rotulo={reputacao?.vendas === 1 ? "venda" : "vendas"} valor={String(reputacao?.vendas ?? 0)} />
          <Numero
            rotulo={reputacao?.avaliacoes === 1 ? "avaliação" : "avaliações"}
            valor={reputacao?.nota != null
              ? reputacao.nota.toFixed(1).replace(".", ",")
              : String(reputacao?.avaliacoes ?? 0)}
            estrela={reputacao?.nota != null}
          />
        </div>

        {reputacao?.nota != null && (
          <div className="mt-2 flex items-center gap-2">
            <StarRating nota={reputacao.nota} />
            <span className="text-[11px] text-muted-foreground">
              {reputacao.avaliacoes} {reputacao.avaliacoes === 1 ? "avaliação" : "avaliações"} de quem comprou
            </span>
          </div>
        )}

        {(vendedor.instagram || vendedor.site) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {vendedor.instagram && (
              <a
                href={vendedor.instagram.startsWith("http") ? vendedor.instagram : `https://instagram.com/${vendedor.instagram.replace("@", "")}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-card px-3 py-2 text-[11px] font-bold text-foreground"
              >
                <Instagram className="h-3.5 w-3.5" /> Instagram
              </a>
            )}
            {vendedor.site && (
              <a
                href={vendedor.site.startsWith("http") ? vendedor.site : `https://${vendedor.site}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-card px-3 py-2 text-[11px] font-bold text-foreground"
              >
                <Globe className="h-3.5 w-3.5" /> Site
              </a>
            )}
          </div>
        )}

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground">
              {produtos.length === 1 ? "1 produto" : `${produtos.length} produtos`}
            </h2>
            {gratuitos > 0 && (
              <span className="text-[11px] font-bold text-emerald-400">
                {gratuitos} {gratuitos === 1 ? "gratuito" : "gratuitos"}
              </span>
            )}
          </div>

          {produtos.length === 0 ? (
            <p className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-card p-6 text-center text-xs text-muted-foreground">
              <PackageOpen className="h-5 w-5 opacity-50" />
              Este vendedor não tem produtos disponíveis na sua região agora.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {produtos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate({ to: "/student/store", search: { produto: p.id } as never })}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-card text-left"
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="aspect-square w-full bg-muted/30" />
                  )}
                  <div className="p-2">
                    <p className="line-clamp-2 text-[12px] font-bold leading-snug text-foreground">
                      {p.title}
                    </p>
                    <p className="mt-1 text-[12px] font-bold text-primary">
                      {p.isFreebie ? "Gratuito" : dinheiro(p.price)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, estrela }: { rotulo: string; valor: string; estrela?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-3 text-center">
      <p className="flex items-center justify-center gap-1 text-lg font-bold text-foreground">
        {estrela && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
        {valor}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
    </div>
  );
}

export default PaginaDoVendedor;
