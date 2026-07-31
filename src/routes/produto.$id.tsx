import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Lock, ShoppingBag, UserPlus } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useRedirectLoggedStore } from "@/lib/useRedirectLoggedStore";
import { setStoreIntent } from "@/lib/post-auth-intent";

import {
  fetchPublicProduct,
  readPublicCart,
  readReferralContext,
  writePublicCart,
  type PublicCartLine,
  type PublicProduct,
} from "@/lib/public-store";

/**
 * Permalink público de produto — `/produto/{id}?ref={codigo}`.
 *
 * É a rota que faltava: hoje `/r/{code}?p={id}` guarda o id do produto e
 * manda a pessoa para o formulário de cadastro sem nunca mostrar o produto.
 * Aqui o link abre o produto.
 *
 * O `loader` roda no SERVIDOR de propósito. É o que permite ao `head`
 * emitir Open Graph no HTML — sem isso, o link colado no WhatsApp vira um
 * retângulo cinza e a conversão morre antes da página abrir.
 */
export const Route = createFileRoute("/produto/$id")({
  loader: async ({ params }) => ({
    produto: await fetchPublicProduct(params.id),
  }),
  head: ({ loaderData }) => {
    const p = loaderData?.produto;
    if (!p) {
      return { meta: [{ title: "Produto não encontrado — FitMind Club" }] };
    }
    const titulo = `${p.title} — FitMind Club`;
    const descricao =
      p.shortDescription ??
      p.subtitle ??
      "Conheça os planos, cursos e benefícios do FitMind Club.";
    return {
      meta: [
        { title: titulo },
        { name: "description", content: descricao },
        { property: "og:type", content: "product" },
        { property: "og:title", content: titulo },
        { property: "og:description", content: descricao },
        ...(p.imageUrl
          ? [
              { property: "og:image", content: p.imageUrl },
              // sobrescreve o twitter:image global do Lovable, que aponta
              // para um PNG antigo de preview e brigaria com o og:image
              { name: "twitter:image", content: p.imageUrl },
            ]
          : []),
        {
          name: "twitter:card",
          content: p.imageUrl ? "summary_large_image" : "summary",
        },
        { name: "twitter:title", content: titulo },
        { name: "twitter:description", content: descricao },
      ],
    };
  },
  component: ProdutoPublico,
});

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Preco({ p }: { p: PublicProduct }) {
  if (p.isPriceRange && p.minPrice !== null) {
    return (
      <p className="text-2xl font-bold text-white">
        {brl(p.minPrice)}
        {p.maxPrice !== null && (
          <span className="text-base font-normal text-white/60">
            {" "}
            a {brl(p.maxPrice)}
          </span>
        )}
      </p>
    );
  }
  return (
    <div className="flex items-baseline gap-2">
      <p className="text-2xl font-bold text-white">{brl(p.price)}</p>
      {p.originalPrice !== null && p.originalPrice > p.price && (
        <p className="text-sm text-white/40 line-through">
          {brl(p.originalPrice)}
        </p>
      )}
    </div>
  );
}

function ProdutoPublico() {
  const { produto } = Route.useLoaderData();
  const redirectStatus = useRedirectLoggedStore(produto?.id ?? null);

  /**
   * `montado` evita divergência de hidratação: o servidor não tem
   * localStorage, então renderiza carrinho vazio. Só depois de montar a
   * gente mostra o estado real. O conteúdo e as meta tags continuam vindo
   * do servidor, que é o que importa para o preview do link.
   */
  const [montado, setMontado] = useState(false);
  const [cart, setCart] = useState<PublicCartLine[]>([]);
  const [indicacao, setIndicacao] = useState<string | null>(null);

  useEffect(() => {
    setCart(readPublicCart());
    setIndicacao(readReferralContext().sponsorName);
    setMontado(true);
  }, []);

  useEffect(() => {
    if (montado) writePublicCart(cart);
  }, [cart, montado]);

  const noCarrinho = useMemo(
    () => (produto ? cart.find((l) => l.id === produto.id) : undefined),
    [cart, produto],
  );

  if (redirectStatus !== "public") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Abrindo sua loja...</p>
      </div>
    );
  }

  function adicionar() {
    if (!produto) return;
    setCart((atual) => {
      const existente = atual.find((l) => l.id === produto.id);
      if (existente) {
        return atual.map((l) =>
          l.id === produto.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...atual,
        {
          id: produto.id,
          kind: produto.kind,
          title: produto.title,
          price: produto.price,
          imageUrl: produto.imageUrl,
          quantity: 1,
        },
      ];
    });
  }

  if (!produto) {
    return (
      <div className="min-h-screen bg-background p-6 text-center">
        <Logo className="mx-auto h-8" />
        <p className="mt-10 text-sm font-bold text-white">
          Produto não encontrado
        </p>
        <p className="mt-1 text-xs text-white/60">
          Ele pode ter saído do ar ou o link estar incompleto.
        </p>
        <Link
          to="/loja"
          className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
        >
          Ver a loja
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="flex items-center gap-3 border-b border-white/10 p-4 md:px-6">
        <Link to="/loja" aria-label="Voltar para a loja">
          <ArrowLeft className="h-5 w-5 text-white/70" />
        </Link>
        <Logo className="h-7" />
      </header>

      {montado && indicacao && (
        <p className="bg-primary/10 px-4 py-2 text-center text-[11px] text-primary">
          Você foi convidado por {indicacao}
        </p>
      )}

      <div className="mx-auto grid w-full max-w-5xl gap-6 px-0 md:grid-cols-2 md:px-6 md:py-8">
      <div className="aspect-square w-full overflow-hidden bg-white/5 md:sticky md:top-6 md:self-start md:rounded-2xl md:border md:border-white/10">
        {produto.imageUrl ? (
          <img
            src={produto.imageUrl}
            alt={produto.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ShoppingBag className="h-12 w-12 text-white/20" />
          </div>
        )}
      </div>

      <div className="p-4 md:p-0">
        {produto.sectionName && (
          <p className="text-[11px] uppercase tracking-wide text-white/45">
            {produto.sectionName}
          </p>
        )}
        <h1 className="mt-1 text-xl font-bold text-white">{produto.title}</h1>
        {produto.subtitle && (
          <p className="mt-1 text-sm text-white/60">{produto.subtitle}</p>
        )}

        {produto.badgeLabel && (
          <span className="mt-3 inline-block rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold text-primary">
            {produto.badgeLabel}
          </span>
        )}

        <div className="mt-4">
          <Preco p={produto} />
        </div>

        {produto.shortDescription && (
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            {produto.shortDescription}
          </p>
        )}

        {/* Portão: ver é livre, aprofundar exige conta. */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            <p className="text-sm font-bold text-white">
              Detalhes completos no app
            </p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-white/60">
            Conteúdo completo, o que está incluído e as condições de
            pagamento aparecem quando você cria sua conta.
          </p>
        </div>

        {/* A escada de três degraus, dita sem prometer o que não é verdade. */}
        <ul className="mt-4 space-y-2 text-xs text-white/60">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>Navegar pela loja é livre, sem conta.</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              Criar conta é grátis e ativa o app com acompanhamento do seu
              coach.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              A carteirinha ativa na primeira compra e libera os benefícios
              dos parceiros.
            </span>
          </li>
        </ul>
      </div>
      </div>

      {/* Barra fixa: carrinho funciona deslogado, mesma chave da loja logada. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-5xl">
        <div className="flex gap-2">
          <button
            onClick={adicionar}
            disabled={!produto.inStock}
            className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-40"
          >
            {!produto.inStock
              ? "Indisponível"
              : noCarrinho
                ? `No carrinho (${noCarrinho.quantity})`
                : "Adicionar ao carrinho"}
          </button>
          <Link
            to="/register"
            onClick={() => setStoreIntent(produto.id)}

            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
          >
            <UserPlus className="h-4 w-4" />
            Criar conta grátis
          </Link>
        </div>
        <Link
          to="/student/store"
          search={{ produto: produto.id }}
          onClick={() => setStoreIntent(produto.id)}
          className="mt-2 block text-center text-[11px] font-medium text-white/50 underline"

        >
          Já tenho conta — ver no app
        </Link>
        </div>
      </div>
    </div>
  );
}
