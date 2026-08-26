import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";
import { WalletPayButton } from "@/components/payments/WalletPayButton";
import { PurchaseSuccessModal, type PurchasedItem } from "@/components/store/PurchaseSuccessModal";
import { MasterCoachCommissionSelector } from "@/components/coach/MasterCoachCommissionSelector";
import { attachShippingToOrder } from "@/lib/shipping-orders.functions";
import { listProductsWithRealEarnings } from "@/lib/coach-network.functions";
import { calcularGanhos, type Ganhos } from "@/lib/store-earnings";
import { supabase } from "@/integrations/supabase/client";
import { getShareOrigin } from "@/lib/auth-redirects";
import { maskCPFSensitive } from "@/lib/masks";
import { StoreBanner, StorePopup } from "@/components/store/StoreBanner";
import { loadBanners, type StoreBanner as BannerRow } from "@/lib/store-banners";
import { StoreOrders } from "@/components/store/StoreOrders";
import { useVisibilidadeLoja } from "@/lib/store-visibility";
import { AlertTriangle, ChevronDown, Eye, EyeOff, History, IdCard, Loader2, MapPin, Minus, Plus, Search, Share2, ShoppingBag, ShoppingCart, Ticket, Timer, Trash2, TrendingUp, Trophy, UserRound, X } from "lucide-react";

import {
  buscar,
  foldText,
  groupBySeller,
  loadUnifiedCatalog,
  matchesQuery,
  type UnifiedCatalog,
  type UnifiedOrigin,
  type UnifiedProduct,
} from "@/lib/unified-store";

import {
  aplicarLocal,
  type CidadeComLoja,
  chaveCidade,
  contarLocais,
  EMPTY_LOCATION,
  loadStoreLocation,
  type LocalSelecionado,
  type StoreLocation,
} from "@/lib/store-location";
import {
  buildNetwork,
  buildRecommendations,
  buildScarcity,
  EMPTY_CONTEXT,
  loadStockStatus,
  loadStoreContext,
  sortShowcase,
  type StoreContext,
} from "@/lib/store-personalization";
import {
  type CartItem,
  exigeEntrega,
  type OrderStep,
  useCarrinho,
} from "@/lib/store-cart";
import {
  criarProximaVendaDoCoach,
  criarProximoPedido,
  faltaParaEntrega,
  limparErroDeCheckout,
  type PayOrder,
  type PaymentMethod,
  SHIPPING_VAZIO,
  type ShippingForm,
} from "@/lib/store-checkout";
import { type CoachSaleRow, type SaleClient, useCoachContext } from "@/lib/store-coach";
import { useIndicacao } from "@/lib/store-referral";
import { StoreFilterButton, StoreFilterSheet } from "@/components/store/StoreFilters";
import {
  type AbaDaLoja,
  aplicarAba,
  aplicarFiltros,
  contarFiltros,
  FILTROS_VAZIOS,
  motivoDoVazio,
  ordenar,
  type FiltrosDaLoja,
} from "@/lib/store-filters";

import { clearPublicCart, readPublicCart } from "@/lib/public-store";
import { preflightDeAgendamento } from "@/lib/store-scheduling";
import { AvailabilityPicker } from "@/components/professional/AvailabilityPicker";
import { cartIdDoProduto } from "@/lib/store-cart";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ORIGIN_LABEL: Record<UnifiedOrigin, string> = {
  fitmind: "FitMind",
  partner: "Parceiro",
  professional: "Profissional",
};

type StockMap = Record<string, { stock: number; remaining: number }>;

/**
 * Vitrine unificada — superfície de teste.
 *
 * A ordem dos blocos é a sequência de conversão, não estética: carteirinha,
 * escassez e renovação acima; exploração por seção no fim. Cada bloco some
 * sozinho quando não tem dado — vitrine sem "Perto de você" é melhor que
 * "Perto de você" vazio.
 */
export function UnifiedStorePage({
  audience = "student",
  requestedProductId,
  openCheckout = false,
}: {
  audience?: "student" | "coach";
  /** `?produto=<id>` — abre o detalhe direto. Vem de indicação ou anúncio. */
  requestedProductId?: string;
  /** `?checkout=1` — veio da loja pública com o carrinho montado. */
  openCheckout?: boolean;
}) {
  const [catalog, setCatalog] = useState<UnifiedCatalog | null>(null);
  const [ctx, setCtx] = useState<StoreContext>(EMPTY_CONTEXT);
  const [stock, setStock] = useState<StockMap>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UnifiedProduct | null>(null);
  const [local, setLocal] = useState<StoreLocation>(EMPTY_LOCATION);
  const [ondeEstou, setOndeEstou] = useState<LocalSelecionado>({ modo: "todas" });
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosDaLoja>(FILTROS_VAZIOS);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  /** Aba da vitrine: pago e gratuito não dividem a mesma grade. */
  const [aba, setAba] = useState<AbaDaLoja>("tudo");

  const navigate = useNavigate();
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);

  // Mesmo carrinho da loja atual — mesma chave de storage, mesmo formato de
  // item. Quem montou o carrinho lá encontra ele aqui, e vice-versa.
  const carrinho = useCarrinho(audience);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [shipping, setShipping] = useState<ShippingForm>(SHIPPING_VAZIO);
  const [aceitouPrazo, setAceitouPrazo] = useState(false);
  const [aceitouEndereco, setAceitouEndereco] = useState(false);
  const [criandoPedido, setCriandoPedido] = useState(false);
  const [payOrder, setPayOrder] = useState<PayOrder | null>(null);
  const [comprado, setComprado] = useState<{ items: PurchasedItem[]; buyerName: string | null } | null>(null);
  const attachShipping = useServerFn(attachShippingToOrder);
  const fetchRealEarnings = useServerFn(listProductsWithRealEarnings);

  // Modo coach: o coach não compra, vende para um aluno. Sem aluno escolhido
  // não existe pedido — por isso o seletor é pré-condição, não enfeite.
  const modoCoach = audience === "coach";
  const coach = useCoachContext(modoCoach);
  const [selectedClient, setSelectedClient] = useState<SaleClient | null>(null);
  const [seletorAlunoAberto, setSeletorAlunoAberto] = useState(false);

  // Indicação: metade divulgar, metade atribuir. A segunda é a que passa
  // batido, porque nada quebra quando falta — só falta comissão.
  const indicacao = useIndicacao(audience);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  // As tres regras de visibilidade. Faltar qualquer uma e vazamento de
  // catalogo entre redes, nao falta de recurso.
  const visibilidade = useVisibilidadeLoja(audience === "coach", audience === "coach" ? "coach" : "student");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // As colunas financeiras só descem em modo coach, e a garantia é esta
        // chamada — não uma checagem de papel na renderização.
        const data = await loadUnifiedCatalog({
          paraCoach: audience === "coach",
          ganhosReais: audience === "coach" ? () => fetchRealEarnings() : undefined,
        });
        if (!active) return;
        setCatalog(data);

        const partnerIds = data.products
          .filter((p) => p.origin === "partner")
          .map((p) => p.sourceId);

        const [context, stockMap, loc, bs] = await Promise.all([
          loadStoreContext(data),
          loadStockStatus(partnerIds),
          loadStoreLocation(),
          loadBanners(),
        ]);
        if (!active) return;
        setCtx(context);
        setStock(stockMap);
        setLocal(loc);
        setBanners(bs);

        // "Minha localizacao" vem do cadastro, que o ComplianceGate ja exige.
        // So entra se a cidade do perfil tiver loja - senao abriria vazio.
        const minha = chaveCidade(context.currentCity);
        const achou = minha ? loc.cidades.find((c) => c.chave === minha) : undefined;
        if (achou) setOndeEstou({ modo: "cidade", chave: achou.chave, nome: achou.nome, uf: achou.uf });
      } catch (error) {
        console.error("[unified-store] carga", error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // A audiência vem da rota e não muda enquanto a tela vive; recarregar o
    // catálogo por causa dela seria trabalho para um caso que não existe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `?? []` cria um array novo a cada render, e isso reexecutava todo memo e
  // todo efeito que depende de `products`. Estabilizar a referência aqui é
  // mais barato que espalhar guardas por quem consome.
  const products = useMemo(() => catalog?.products ?? [], [catalog]);

  const visiveis = useMemo(() => visibilidade.filtrar(products), [products, visibilidade]);

  const usableSections = useMemo(() => {
    const used = new Set(visiveis.map((p) => p.sectionId).filter(Boolean) as string[]);
    return (catalog?.sections ?? [])
      .filter((s) => used.has(s.id))
      .filter((s) => visibilidade.secaoVisivel(s.id));
  }, [catalog, visiveis, visibilidade]);

  const noLocal = useMemo(() => aplicarLocal(visiveis, local, ondeEstou), [visiveis, local, ondeEstou]);

  /** Antes dos filtros. É o conjunto que decide qual opção é útil. */
  const antesDosFiltros = useMemo(() => {
    const naSecao = noLocal.filter((p) => !sectionId || p.sectionId === sectionId);
    const naAba = aplicarAba(naSecao, aba);
    // `buscar` já devolve por relevância: título antes de descrição, começo de
    // palavra antes de erro de digitação. Manter a ordem alfabética aqui seria
    // jogar fora justamente o que faz a busca parecer certa.
    return foldText(query) ? buscar(naAba, query) : naAba;
  }, [noLocal, query, sectionId, aba]);

  const filtered = useMemo(
    () => aplicarFiltros(antesDosFiltros, filtros),
    [antesDosFiltros, filtros],
  );

  /** Quando a lista zera por causa de filtro, o vazio explica o motivo. */
  const motivoVazio = useMemo(
    () => (filtered.length === 0 ? motivoDoVazio(antesDosFiltros, filtros) : null),
    [filtered.length, antesDosFiltros, filtros],
  );

  /**
   * Busca sem resultado na cidade escolhida, mas com resultado no catálogo
   * inteiro. Vale dizer isso: a pessoa acha que o produto não existe quando na
   * verdade é o recorte de cidade que está escondendo.
   */
  const achariaEmOutraCidade = useMemo(() => {
    if (filtered.length > 0 || !foldText(query)) return 0;
    return visiveis.filter((p) => matchesQuery(p, query)).length;
  }, [filtered.length, query, visiveis]);

  /** Acabaram os vendedores locais: sobrou so o catalogo nacional. */
  const semLojaLocal =
    ondeEstou.modo === "cidade" && contarLocais(visiveis, local, ondeEstou.chave) === 0;

  const searching = foldText(query).length > 0;
  const browsing = !searching && !sectionId;

  const scarcity = useMemo(() => buildScarcity(filtered, stock), [filtered, stock]);
  const recommendations = useMemo(() => buildRecommendations(filtered, ctx), [filtered, ctx]);
  const network = useMemo(() => buildNetwork(filtered, ctx), [filtered, ctx]);
  // A ordem de recomendação (compra anterior, escassez, rede) é a que vale
  // enquanto a pessoa não pedir outra. Durante uma busca quem manda é a
  // relevância — e por isso a vitrine não reordena nesse caso.
  const showcase = useMemo(() => {
    if (searching && filtros.ordenacao === "relevancia") return filtered;
    return ordenar(sortShowcase(filtered, ctx, stock), filtros.ordenacao);
  }, [filtered, ctx, stock, filtros.ordenacao, searching]);


  const byOrigin = useMemo(() => {
    return (["fitmind", "partner", "professional"] as UnifiedOrigin[])
      .map((origin) => ({ origin, items: showcase.filter((p) => p.origin === origin) }))
      .filter((group) => group.items.length > 0);
  }, [showcase]);

  /**
   * Adiciona e abre o carrinho.
   *
   * Abrir na hora é escolha: o carrinho é onde está o aviso de quantos pedidos
   * a compra vira, e esconder isso até o fim é a queixa que originou a
   * mudança. Recusa (sem estoque, agendável sem horário) vira toast e o
   * carrinho fica fechado.
   */
  const adicionarAoCarrinho = async (product: UnifiedProduct, horario?: string | null) => {
    // Atendimento com hora marcada: antes de reservar outro, resolve o que
    // ficou pendente. Sem isso o aluno acumula duas reservas e o profissional
    // vê dois horários bloqueados, um deles para um pedido que nunca será pago.
    if (product.isSchedulable && horario) {
      const { removerDoCarrinho, cancelados } = await preflightDeAgendamento({
        professionalProductId: product.sourceId,
        studentId: ctx.studentId,
        novoHorarioISO: horario,
        baseCartId: cartIdDoProduto(product),
      });
      removerDoCarrinho.forEach((id) => carrinho.remover(id));
      if (cancelados > 0) toast.info("Agendamento anterior cancelado.");
    }

    const recusa = carrinho.adicionar(product, horario ?? null);
    if (recusa) {
      toast.error(recusa);
      return;
    }
    setDetail(null);
    setCarrinhoAberto(true);
  };

  /**
   * Abre o produto pedido pela URL, uma vez só.
   *
   * Espera o catálogo terminar: antes disso `products` está vazio e o id não
   * casa com nada. O `useRef` impede reabrir o modal cada vez que a lista
   * muda — fechar e ver o modal voltar sozinho é o tipo de coisa que faz a
   * pessoa desistir.
   */
  const deepLinkTratado = useRef(false);
  useEffect(() => {
    if (deepLinkTratado.current || loading || !requestedProductId) return;
    const achado = products.find(
      (p) => p.sourceId === requestedProductId || p.id === requestedProductId,
    );
    deepLinkTratado.current = true;
    if (achado) setDetail(achado);
    else toast.error("Este produto não está mais disponível.");
  }, [loading, products, requestedProductId]);

  /**
   * Adota o carrinho montado na loja pública.
   *
   * A loja pública usa outra chave (`fitmind_public_cart`), e é a loja logada
   * que faz a ponte. Sem esta importação, quem monta o carrinho antes de se
   * cadastrar chega aqui com a loja vazia — e o funil inteiro de captação
   * termina em nada.
   *
   * Casa por id aceitando sufixo porque a loja pública grava o id da tabela de
   * origem, sem o prefixo da vitrine. Preço e estoque vêm SEMPRE do catálogo
   * real: o que estava no carrinho público é intenção, não preço.
   */
  const publicoImportado = useRef(false);
  useEffect(() => {
    if (publicoImportado.current || loading || audience === "coach") return;
    publicoImportado.current = true;

    const linhas = readPublicCart();
    if (!linhas.length) return;

    let entraram = 0;
    for (const linha of linhas) {
      const achado = products.find(
        (p) => p.id === linha.id || p.sourceId === linha.id || p.id.endsWith(`-${linha.id}`),
      );
      if (achado && !carrinho.adicionar(achado)) entraram += 1;
    }
    clearPublicCart();

    if (entraram < linhas.length) {
      toast.info("Alguns itens do seu carrinho não estão mais disponíveis.");
    }
    if (entraram > 0 && openCheckout) setCarrinhoAberto(true);
    // `carrinho` fora das dependências de propósito: incluí-lo re-dispararia a
    // importação a cada mudança do carrinho, e o guard de `useRef` já garante
    // uma vez só.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, products, audience, openCheckout]);

  /**
   * Liga/desliga uma ocultação da rede do coach.
   *
   * Recarregar o catálogo depois não é opcional: em modo coach o produto
   * oculto continua na lista (o coach precisa vê-lo para poder reativar), mas
   * o selo muda — e sem recarregar o selo mente até a próxima navegação.
   */
  const [curando, setCurando] = useState<string | null>(null);
  const curar = async (
    chave: string,
    tipo: "section" | "category" | "product" | "vendor_fitmind",
    kind: string | null,
    targetId: string | null,
    oculto: boolean,
  ) => {
    setCurando(chave);
    try {
      await visibilidade.alternarOculto(tipo, kind, targetId, oculto);
      toast.success(oculto ? "Escondido da sua rede." : "Visível para sua rede de novo.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível mudar agora.");
    } finally {
      setCurando(null);
    }
  };

  const precisaEntrega = exigeEntrega(carrinho.cart);

  /**
   * Cria o próximo pedido do carrinho e abre o pagamento.
   *
   * Um pedido por vez, porque a cobrança é uma por pedido. O que sobrar no
   * carrinho continua lá e a próxima rodada começa quando esta fechar.
   */
  const finalizar = async () => {
    if (carrinho.cart.length === 0 || criandoPedido) return;

    // Coach sem aluno escolhido: abre o seletor em vez de recusar. Recusar
    // seria dizer "faltou algo" sem levar até onde se resolve.
    if (modoCoach && !selectedClient) {
      setCarrinhoAberto(false);
      setSeletorAlunoAberto(true);
      return;
    }

    // A venda do coach não tem entrega: `create_coach_sale` não recebe
    // endereço. Quem compra físico pelo coach acerta a entrega no painel.
    if (!modoCoach && precisaEntrega && carrinho.steps[0]?.key === "fitmind") {
      const falta = faltaParaEntrega(shipping, aceitouPrazo, aceitouEndereco);
      if (falta) { toast.error(falta); return; }
    }

    setCriandoPedido(true);
    try {
      const pedido = modoCoach && selectedClient
        ? await criarProximaVendaDoCoach({
            cart: carrinho.cart,
            paymentMethod,
            client: selectedClient,
          })
        : await criarProximoPedido({
            cart: carrinho.cart,
            paymentMethod,
            shipping,
            studentId: ctx.studentId,
            // Sem isto o link de indicação funciona, a compra acontece, e a
            // comissão de quem indicou não existe.
            referrerStudentId: indicacao.indicadoPor,
            attachShipping,
          });
      if (!pedido) return;
      setCarrinhoAberto(false);
      setPayOrder(pedido);
      if (modoCoach) {
        toast.success("Venda criada. Finalize o pagamento.");
        void coach.recarregar();
      }
    } catch (erro) {
      toast.error(limparErroDeCheckout(erro));
    } finally {
      setCriandoPedido(false);
    }
  };

  /** Itens pagos no formato do pop-up de compra aprovada. */
  const itensComprados = (ids: string[]): PurchasedItem[] =>
    carrinho.cart
      .filter((item) => ids.includes(item.id))
      .map((item) => ({
        productId: item.kind === "partner" || item.kind === "partner_company" ? item.sourceId : null,
        productName: item.title,
        price: item.price * item.quantity,
        kind: item.kind === "partner_company" ? "partner" : item.kind === "partner" ? "professional" : "fitmind",
        slotLabel: item.scheduledSlot
          ? new Date(item.scheduledSlot).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
          : null,
      }));

  /** Pagou: tira do carrinho o que este pedido cobria e mostra a aprovação. */
  const aoPagar = () => {
    const ids = payOrder?.paidItemIds || [];
    setComprado({
      items: itensComprados(ids),
      buyerName: (modoCoach ? selectedClient?.name : payOrder?.name) || null,
    });
    carrinho.limpar(ids);
    if (payOrder?.sourceKind === "store_order") {
      setShipping(SHIPPING_VAZIO);
      setAceitouPrazo(false);
      setAceitouEndereco(false);
    }
    setPayOrder(null);
    if (modoCoach) void coach.recarregar();
  };

  /** Sobrou item: reabre o carrinho, que é onde o próximo pedido começa. */
  const fecharAprovacao = () => {
    setComprado(null);
    if (carrinho.cart.length > 0) setCarrinhoAberto(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Loja {audience === "coach" ? "· modo coach" : ""}
          </p>
          <h1 className="text-2xl font-bold text-foreground">FitMind Club</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {visiveis.length} produtos de {groupBySeller(visiveis).length} vendedores, numa vitrine só.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {modoCoach && <MasterCoachCommissionSelector />}
          {modoCoach && (
            <button
              type="button"
              onClick={() => setHistoricoAberto((v) => !v)}
              aria-expanded={historicoAberto}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-3 text-[10px] font-bold text-foreground"
            >
              <History className="h-3.5 w-3.5 text-primary" /> Histórico ({coach.sales.length})
            </button>
          )}

          <button
            type="button"
            onClick={() => setCarrinhoAberto(true)}
            aria-label={`Carrinho com ${carrinho.quantidade} ${carrinho.quantidade === 1 ? "item" : "itens"}`}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card"
          >
            <ShoppingCart className="h-5 w-5 text-foreground" />
            {carrinho.quantidade > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {carrinho.quantidade}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Aluno da venda. Fica no topo porque muda o significado de tudo que
          vem abaixo: o preço que o coach vê é o que aquele aluno vai pagar. */}
      {modoCoach && (
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">
            Selecione seu aluno
          </p>
          <button
            type="button"
            onClick={() => setSeletorAlunoAberto(true)}
            className="flex w-full items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-3">
              <UserRound className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-foreground">
                  {selectedClient?.name || "Selecione seu aluno"}
                </span>
                {selectedClient?.coachName && (
                  <span className="block truncate text-[11px] font-semibold text-primary">
                    Coach: {selectedClient.coachName}
                  </span>
                )}
                {selectedClient?.email && (
                  <span className="block truncate text-[11px] text-muted-foreground">{selectedClient.email}</span>
                )}
                {selectedClient?.cpf && (
                  <span className="block text-[11px] text-muted-foreground">
                    CPF: {maskCPFSensitive(selectedClient.cpf)}
                  </span>
                )}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </section>
      )}

      {modoCoach && historicoAberto && <CoachSalesPanel sales={coach.sales} />}

      {/* Curadoria do catálogo FitMind inteiro. É o interruptor mais grosso:
          o coach que só vende produto de parceiro desliga a FitMind de uma vez
          em vez de esconder produto por produto. */}
      {modoCoach && visibilidade.pronto && (() => {
        const bloqueadoPeloUpline = visibilidade.ocultadoPorUpline("vendor_fitmind", null, null);
        const escondi = visibilidade.ocultadoPorMim("vendor_fitmind", null, null);
        if (bloqueadoPeloUpline) {
          return (
            <p className="rounded-2xl border border-border bg-card p-3 text-[11px] text-muted-foreground">
              A FitMind está bloqueada pelo seu upline. Só ele pode reativar.
            </p>
          );
        }
        return (
          <button
            type="button"
            disabled={curando !== null}
            onClick={() => void curar("vendor", "vendor_fitmind", null, null, !escondi)}
            className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-left disabled:opacity-60 ${
              escondi ? "border-amber-500/30 bg-amber-500/10" : "border-border bg-card"
            }`}
          >
            <span className="min-w-0">
              <span className="block text-xs font-bold text-foreground">
                {escondi ? "FitMind escondida da sua rede" : "Produtos FitMind visíveis para sua rede"}
              </span>
              <span className="block text-[10px] leading-relaxed text-muted-foreground">
                {escondi
                  ? "Seus alunos não veem nenhum produto FitMind. Toque para mostrar de novo."
                  : "Toque para esconder o catálogo FitMind dos seus alunos."}
              </span>
            </span>
            {curando === "vendor"
              ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              : escondi
                ? <EyeOff className="h-4 w-4 shrink-0 text-amber-500" />
                : <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </button>
        );
      })()}

      {/* Barra de local. Fica no topo como no iFood: o que muda o catalogo
          inteiro precisa estar visivel antes do catalogo. */}
      {local.cidades.length > 0 && (
        <button
          type="button"
          onClick={() => setSeletorAberto(true)}
          className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-left"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
              Mostrando lojas de
            </span>
            <span className="block truncate text-sm font-semibold text-foreground">
              {ondeEstou.modo === "cidade" ? `${ondeEstou.nome} · ${ondeEstou.uf}` : "Todas as cidades"}
            </span>
          </span>
          <span className="shrink-0 text-[11px] font-bold text-primary">Trocar</span>
        </button>
      )}

      {catalog?.errors.length ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-[11px] text-destructive">
            Não carregou: {catalog.errors.join(", ")}. O resto da vitrine está completo.
          </p>
        </div>
      ) : null}

      {/* 1. Carteirinha — o argumento de compra mais forte, e o número já está no banco. */}
      {/* O número é a promessa; o toque tem de levar até ela. Antes isto era
          texto morto: mostrava "R$ 1.200 em gratuitos" e não havia caminho. */}
      {browsing && !ctx.cardActive && ctx.freebiesValue > 0 && (
        <button
          type="button"
          onClick={() => navigate({ to: "/student/freebies" })}
          className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-left"
        >
          <span className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">{fmt(ctx.freebiesValue)}</span>
            <span className="text-[11px] leading-tight text-muted-foreground">
              em {ctx.freebiesCount} gratuitos<br />esperando você
            </span>
          </span>
          <span className="mt-2 block text-[11px] leading-relaxed text-muted-foreground">
            Sua carteirinha está inativa. Ela ativa na primeira compra e libera o resgate dos
            gratuitos dos parceiros — cadastrar-se sozinho não basta.
          </span>
          <span className="mt-2 block text-[11px] font-bold text-primary">
            Ver os gratuitos →
          </span>
        </button>
      )}

      {browsing && ctx.cardActive && ctx.freebiesValue > 0 && (
        <button
          type="button"
          onClick={() => navigate({ to: "/student/freebies" })}
          className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-left"
        >
          <span className="text-[11px] leading-relaxed text-emerald-500">
            <b>Carteirinha ativa</b> até {new Date(ctx.cardValidUntil as string).toLocaleDateString("pt-BR")} ·
            {" "}{fmt(ctx.freebiesValue)} em gratuitos disponíveis para resgate.
          </span>
          <span className="shrink-0 text-[11px] font-bold text-emerald-500">Resgatar →</span>
        </button>
      )}

      {/* Banner: quem abre a loja sem intencao definida nao clica em
          categoria. Precisa de algo na frente. */}
      {browsing && (
        <StoreBanner
          produtos={visiveis}
          banners={banners}
          onAbrir={setDetail}
          onNavegar={(url) => navigate({ to: url })}
        />
      )}

      {/* 2. Busca e filtros. Busca resolve quem sabe o nome; filtro resolve
             quem sabe o que quer mas não como se chama — e com mil e quinhentos
             produtos de quatro fontes, o segundo caso é a maioria. */}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-card px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busque em toda a loja…"
            aria-label="Buscar produtos"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <StoreFilterButton filtros={filtros} onAbrir={() => setFiltrosAbertos(true)} />
      </div>

      {/* Pago e gratuito na mesma grade é o que fazia a loja parecer bagunçada:
          quem entra para comprar não quer filtrar brinde, e quem entra para
          resgatar não quer rolar preço. Duas abas resolvem sem esconder nada. */}
      {contagemDaAba.gratuitos > 0 && (
        <div className="flex gap-2">
          {([
            { id: "tudo", rotulo: "Tudo", n: contagemDaAba.tudo },
            { id: "comprar", rotulo: "Para comprar", n: contagemDaAba.pagos },
            { id: "gratuitos", rotulo: "Gratuitos", n: contagemDaAba.gratuitos },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setAba(t.id)}
              aria-pressed={aba === t.id}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-bold transition ${
                aba === t.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
              }`}
            >
              {t.rotulo} <span className="opacity-60">{t.n}</span>
            </button>
          ))}
        </div>
      )}


      {/* Filtro ligado muda o que a lista significa. Dizer isso na tela evita
          a conclusão errada de que a loja não tem o produto. */}
      {contarFiltros(filtros) > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2">
          <span className="text-[11px] text-muted-foreground">
            {filtered.length} de {antesDosFiltros.length} produtos, com filtro
          </span>
          <button
            type="button"
            onClick={() => setFiltros({ ...FILTROS_VAZIOS, ordenacao: filtros.ordenacao })}
            className="shrink-0 text-[11px] font-bold text-primary"
          >
            Limpar
          </button>
        </div>
      )}

      {/* 3. Taxonomia como filtro, não como pasta */}
      {usableSections.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setSectionId(null)}
            aria-pressed={sectionId === null}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
              sectionId === null ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
            }`}
          >
            Tudo
          </button>
          {usableSections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSectionId(sectionId === s.id ? null : s.id)}
              aria-pressed={sectionId === s.id}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                sectionId === s.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center">
          <ShoppingBag className="mx-auto mb-3 h-7 w-7 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            {contarFiltros(filtros) > 0
              ? "Nenhum produto com esses filtros."
              : searching
                ? `Nada encontrado para "${query}".`
                : "Nenhum produto nesta seção."}
          </p>
          {contarFiltros(filtros) > 0 && (
            <button
              type="button"
              onClick={() => setFiltros({ ...FILTROS_VAZIOS, ordenacao: filtros.ordenacao })}
              className="mt-3 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : searching ? (
        <>
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"} em toda a loja.
          </p>
          {byOrigin.map((group) => (
            <Block key={group.origin} title={ORIGIN_LABEL[group.origin]} hint={`${group.items.length}`}>
              <Grid items={group.items} stock={stock} onOpen={setDetail} mostrarPontos={modoCoach} />
            </Block>
          ))}
        </>
      ) : (
        <>
          {/* 4. Escassez verdadeira — só produto com vaga contada */}
          {scarcity.length > 0 && (
            <Block title="Acaba em breve" hint="vagas reais">
              <Rail>
                {scarcity.map(({ product, remaining, stock: total }) => (
                  <Card
                    key={product.id}
                    product={product}
                    onOpen={setDetail}
                    variant="rail"
                    flag={`${remaining} de ${total} vagas`}
                  />
                ))}
              </Rail>
            </Block>
          )}

          {/* 5. Recomendação por regra, com o motivo escrito no card */}
          {recommendations.length > 0 && (
            <Block title="Para você" hint="por regra, não por palpite">
              <Rail>
                {recommendations.map(({ product, reason }) => (
                  <Card key={product.id} product={product} onOpen={setDetail} reason={reason} variant="rail" mostrarPontos={modoCoach} />
                ))}
              </Rail>
            </Block>
          )}

          {/* 6. A rede do aluno */}
          {network.length > 0 && (
            <Block title="Da sua rede" hint="seu coach e a rede dele">
              <Rail>
                {network.map((product) => (
                  <Card key={product.id} product={product} onOpen={setDetail} variant="rail" mostrarPontos={modoCoach} />
                ))}
              </Rail>
            </Block>
          )}

          {/* Acabaram os vendedores locais. O catalogo FitMind e nacional,
              entao a loja nunca fica vazia — mas precisa dizer o que houve. */}
          {semLojaLocal && (
            <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm font-bold text-amber-500">
                Ainda não há lojas em {ondeEstou.modo === "cidade" ? ondeEstou.nome : "sua cidade"}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-500/80">
                Você está vendo o catálogo FitMind, que vale para todo o Brasil. Quer olhar as
                lojas de outra cidade?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSeletorAberto(true)}
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                >
                  Explorar outras cidades
                </button>
                <button
                  type="button"
                  onClick={() => setOndeEstou({ modo: "todas" })}
                  className="rounded-xl border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-500"
                >
                  Ver tudo
                </button>
              </div>
            </section>
          )}

          {/* 7. Vitrine ordenada por score, empate em ordem alfabética */}
          <Block title="Vitrine" hint={`${showcase.length} itens`}>
            <Grid items={showcase} stock={stock} onOpen={setDetail} mostrarPontos={modoCoach} />
          </Block>

          {/* Pedidos: a loja antiga mostrava "Meus pedidos" aqui, e depois de
              comprar e na loja que a pessoa procura o pedido - nao no perfil. */}
          {/* Só no modo aluno. Em modo coach isto mostraria os pedidos que o
              coach fez COMO ALUNO, dentro da tela onde ele vende para outra
              pessoa — o histórico do coach é o de vendas, não o de compras. */}
          {browsing && !modoCoach && <StoreOrders studentId={ctx.studentId} />}

          {/* 8. A navegação de hoje, preservada para quem já sabe usar */}
          {browsing && usableSections.length > 0 && (
            <Block title="Explorar por seção" hint="navegação de hoje">
              <div className="grid grid-cols-2 gap-3">
                {usableSections.map((s) => {
                  const secaoEscondida = modoCoach
                    && visibilidade.ocultadoPorMim("section", null, s.id);
                  return (
                  <div key={s.id} className="relative">
                  {modoCoach && (
                    <button
                      type="button"
                      disabled={curando !== null}
                      aria-label={secaoEscondida ? "Mostrar seção para a rede" : "Esconder seção da rede"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void curar("sec-" + s.id, "section", null, s.id, !secaoEscondida);
                      }}
                      className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 backdrop-blur"
                    >
                      {curando === "sec-" + s.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        : secaoEscondida
                          ? <EyeOff className="h-3.5 w-3.5 text-amber-500" />
                          : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSectionId(s.id)}
                    className={`w-full overflow-hidden rounded-2xl bg-card text-left transition-colors hover:bg-accent ${
                      secaoEscondida ? "opacity-40" : ""
                    }`}
                  >
                    {s.imageUrl ? (
                      <img src={s.imageUrl} alt="" className="h-24 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-24 w-full items-center justify-center bg-muted">
                        <ShoppingBag className="h-6 w-6 text-muted-foreground opacity-50" />
                      </div>
                    )}
                    <p className="px-3 py-2 text-sm font-bold text-foreground">{s.name}</p>
                  </button>
                  </div>
                  );
                })}
              </div>
            </Block>
          )}
        </>
      )}

      {filtrosAbertos && (
        <StoreFilterSheet
          filtros={filtros}
          onMudar={setFiltros}
          produtos={antesDosFiltros}
          resultado={filtered.length}
          onClose={() => setFiltrosAbertos(false)}
        />
      )}

      {seletorAberto && (
        <CitySheet
          cidades={local.cidades}
          atual={ondeEstou}
          minhaCidade={chaveCidade(ctx.currentCity)}
          onPick={(sel) => { setOndeEstou(sel); setSeletorAberto(false); }}
          onClose={() => setSeletorAberto(false)}
        />
      )}

      <StorePopup banners={banners} onNavegar={(url) => navigate({ to: url })} />

      {detail && (
        <DetailSheet
          product={detail}
          onClose={() => setDetail(null)}
          onAdd={adicionarAoCarrinho}
          noCarrinho={carrinho.cart.some((item) => item.sourceId === detail.sourceId && item.kind === detail.kind)}
          modoCoach={modoCoach}
          hasUpline={coach.hasUpline}
          podeIndicar={indicacao.podeIndicar(detail.sourceId)}
          onIndicar={() => void indicacao.compartilhar(detail.sourceId, indicacao.meuCodigo)}
          podeCurar={modoCoach && !!visibilidade.kindDeCuradoria(detail)}
          escondidoDaRede={visibilidade.ocultadoPorMim(
            "product",
            visibilidade.kindDeCuradoria(detail),
            detail.sourceId,
          )}
          onCurar={() => void curar(
            "prod-" + detail.id,
            "product",
            visibilidade.kindDeCuradoria(detail),
            detail.sourceId,
            !visibilidade.ocultadoPorMim("product", visibilidade.kindDeCuradoria(detail), detail.sourceId),
          )}
          carteirinhaAtiva={ctx.cardActive}
          onVerGratuitos={() => navigate({ to: "/student/freebies" })}
        />
      )}

      {carrinhoAberto && (
        <CartSheet
          cart={carrinho.cart}
          subtotal={carrinho.subtotal}
          steps={carrinho.steps}
          onQuantidade={carrinho.alterarQuantidade}
          onRemover={carrinho.remover}
          onClose={() => setCarrinhoAberto(false)}
          checkout={{
            paymentMethod,
            onPaymentMethod: setPaymentMethod,
            precisaEntrega,
            shipping,
            onShipping: (patch) => setShipping((atual) => ({ ...atual, ...patch })),
            aceitouPrazo,
            onAceitouPrazo: setAceitouPrazo,
            aceitouEndereco,
            onAceitouEndereco: setAceitouEndereco,
            criando: criandoPedido,
            onFinalizar: finalizar,
            modoCoach,
            clienteNome: selectedClient?.name ?? null,
            onTrocarCliente: () => { setCarrinhoAberto(false); setSeletorAlunoAberto(true); },
          }}
        />
      )}

      {seletorAlunoAberto && (
        <ClientPickerSheet
          clients={coach.clients}
          isMaster={coach.isMaster}
          carregando={coach.carregando}
          onPick={(cliente) => {
            setSelectedClient(cliente);
            setSeletorAlunoAberto(false);
            if (carrinho.cart.length > 0) setCarrinhoAberto(true);
          }}
          onClose={() => setSeletorAlunoAberto(false)}
        />
      )}

      {payOrder && (
        <PaySheet
          order={payOrder}
          paymentMethod={paymentMethod}
          restante={carrinho.steps.length - 1}
          cliente={modoCoach ? selectedClient : null}
          onPaid={aoPagar}
          onClose={() => setPayOrder(null)}
        />
      )}

      {comprado && (
        <PurchaseSuccessModal
          items={comprado.items}
          buyerName={comprado.buyerName}
          onClose={fecharAprovacao}
        />
      )}
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {hint && <span className="shrink-0 text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Trilho horizontal: mantém o bloco curto sem esconder o que vem depois. */
function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function Grid({ items, stock, onOpen, mostrarPontos = false }: { items: UnifiedProduct[]; stock: StockMap; onOpen: (p: UnifiedProduct) => void; mostrarPontos?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => {
        const info = stock[item.sourceId];
        const flag = info && info.stock > 0 && info.remaining > 0 && info.remaining <= 3
          ? `${info.remaining} de ${info.stock} vagas`
          : undefined;
        return <Card key={item.id} product={item} onOpen={onOpen} flag={flag} mostrarPontos={mostrarPontos} />;
      })}
    </div>
  );
}

/**
 * Card único para as quatro origens. O selo de vendedor é o que substitui a
 * aba de parceiros: o crédito aparece dentro do fluxo principal.
 *
 * Sem largura fixa e sem breakpoint de viewport — quem manda é o container.
 * Foi `xl:grid-cols-5` dentro do shell de 430px que espremia os cards da loja
 * de parceiros em cinco colunas na tela grande.
 */
function Card({
  product,
  onOpen,
  reason,
  flag,
  variant = "grid",
  mostrarPontos = false,
}: {
  product: UnifiedProduct;
  onOpen: (p: UnifiedProduct) => void;
  reason?: string;
  flag?: string;
  /** Pontos de carreira só fazem sentido para quem vende. */
  mostrarPontos?: boolean;
  /** "rail" tem largura própria porque rola na horizontal; "grid" obedece a célula. */
  variant?: "grid" | "rail";
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(product)}
      className={`flex flex-col overflow-hidden rounded-2xl bg-card text-left transition-colors hover:bg-accent ${
        variant === "rail" ? "w-[9.25rem] shrink-0" : "w-full"
      }`}
    >
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-muted">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ShoppingBag className="h-7 w-7 text-muted-foreground opacity-50" />
        )}
        {flag && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
            <Timer className="h-2.5 w-2.5" />{flag}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
          {product.sellerName}
        </p>
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
          {product.title}
        </p>

        {(product.cardDays > 0 || product.challengeTickets > 0 || (mostrarPontos && product.pointsPerSale > 0)) && (
          <div className="flex flex-wrap gap-1">
            {mostrarPontos && product.pointsPerSale > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                <Trophy className="h-2.5 w-2.5" />+{product.pointsPerSale} pts
              </span>
            )}
            {product.cardDays > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-500">
                <IdCard className="h-2.5 w-2.5" />+{product.cardDays}d
              </span>
            )}
            {product.challengeTickets > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-500">
                <Ticket className="h-2.5 w-2.5" />{product.challengeTickets}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-baseline gap-1.5 pt-1">
          {product.isFreebie ? (
            <span className="text-sm font-bold text-emerald-500">Gratuito</span>
          ) : (
            <span className="text-sm font-bold tabular-nums text-foreground">{fmt(product.price)}</span>
          )}
          {!product.isFreebie && product.originalPrice && product.originalPrice > product.price && (
            <span className="text-[10px] tabular-nums text-muted-foreground line-through">
              {fmt(product.originalPrice)}
            </span>
          )}
          {product.isFreebie && product.originalPrice ? (
            <span className="text-[10px] tabular-nums text-muted-foreground line-through">
              {fmt(product.originalPrice)}
            </span>
          ) : null}
        </div>
      </div>

      {reason && (
        <p className="border-t border-border bg-primary/10 px-2.5 py-1.5 text-[9.5px] leading-snug text-primary">
          {reason}
        </p>
      )}
    </button>
  );
}

/**
 * Seletor de cidade.
 *
 * Ordena por numero de vendedores, nao alfabeticamente: a cidade com mais loja
 * e a que mais gente procura. A cidade do perfil vem marcada, para a pessoa
 * reconhecer a dela sem ler a lista toda.
 */
function CitySheet({
  cidades,
  atual,
  minhaCidade,
  onPick,
  onClose,
}: {
  cidades: CidadeComLoja[];
  atual: LocalSelecionado;
  minhaCidade: string;
  onPick: (sel: LocalSelecionado) => void;
  onClose: () => void;
}) {
  const [busca, setBusca] = useState("");
  const termo = chaveCidade(busca);
  const lista = termo ? cidades.filter((c) => c.chave.includes(termo)) : cidades;

  return (
    <div
      className="modal-safe fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Escolher cidade"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Onde você quer comprar</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Cursos e protocolos da FitMind aparecem em qualquer cidade.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {cidades.length > 6 && (
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cidade…"
            aria-label="Buscar cidade"
            className="mb-3 w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        )}

        <button
          type="button"
          onClick={() => onPick({ modo: "todas" })}
          className={`mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left ${
            atual.modo === "todas" ? "border-primary bg-primary/10" : "border-border bg-muted"
          }`}
        >
          <span className="text-sm font-semibold text-foreground">Todas as cidades</span>
          <span className="text-[10px] text-muted-foreground">sem filtro</span>
        </button>

        <div className="flex flex-col gap-1.5">
          {lista.map((c) => {
            const ativa = atual.modo === "cidade" && atual.chave === c.chave;
            return (
              <button
                key={c.chave + c.uf}
                type="button"
                onClick={() => onPick({ modo: "cidade", chave: c.chave, nome: c.nome, uf: c.uf })}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left ${
                  ativa ? "border-primary bg-primary/10" : "border-border bg-muted"
                }`}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {c.nome} · {c.uf}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {c.vendedores} {c.vendedores === 1 ? "vendedor" : "vendedores"}
                    {c.chave === minhaCidade ? " · sua cidade" : ""}
                  </span>
                </span>
              </button>
            );
          })}
          {lista.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhuma cidade encontrada para “{busca}”.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailSheet({
  product,
  onClose,
  onAdd,
  noCarrinho,
  modoCoach,
  hasUpline,
  podeIndicar,
  onIndicar,
  podeCurar,
  escondidoDaRede,
  onCurar,
  carteirinhaAtiva,
  onVerGratuitos,
}: {
  product: UnifiedProduct;
  onClose: () => void;
  onAdd: (product: UnifiedProduct, horario?: string | null) => Promise<void>;
  noCarrinho: boolean;
  modoCoach: boolean;
  hasUpline: boolean;
  /** Produto liberado para indicação por quem está olhando. */
  podeIndicar: boolean;
  onIndicar: () => void;
  /**
   * Curadoria só existe para produto que tem `product_kind` de override —
   * ou seja, catálogo FitMind. Parceiro e profissional não têm, e oferecer o
   * botão ali daria um toque que não faz nada.
   */
  podeCurar: boolean;
  escondidoDaRede: boolean;
  onCurar: () => void;
  carteirinhaAtiva: boolean;
  onVerGratuitos: () => void;
}) {
  const semEstoque = product.stock !== null && product.stock !== undefined && product.stock <= 0;
  const ganhos = modoCoach ? calcularGanhos(product.price, product.comissao, hasUpline) : null;
  const [horario, setHorario] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const [imagem, setImagem] = useState(0);

  return (
    <div
      className="modal-safe fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={product.title}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {ORIGIN_LABEL[product.origin]} · {product.sellerName}
              {product.sellerCity ? ` · ${product.sellerCity}` : ""}
            </p>
            <h2 className="text-base font-bold text-foreground">{product.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {product.imageUrls.length > 0 && (
          <div className="mb-3">
            <img
              src={product.imageUrls[Math.min(imagem, product.imageUrls.length - 1)]}
              alt=""
              className="max-h-56 w-full rounded-xl object-cover"
            />
            {/* Miniaturas só quando há mais de uma: uma fileira com um item só
                é ruído que sugere que existe mais para ver. */}
            {product.imageUrls.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {product.imageUrls.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setImagem(i)}
                    aria-label={`Imagem ${i + 1}`}
                    aria-pressed={i === imagem}
                    className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 ${
                      i === imagem ? "border-primary" : "border-transparent opacity-60"
                    }`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {product.description && (
          <p className="mb-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          {/* Preço variável mostra a faixa, não um número só: dizer "R$ 80"
              num serviço que vai de 80 a 300 é a origem da reclamação de
              "cobraram mais do que estava na loja". */}
          {product.isPriceRange && product.minPrice != null && product.maxPrice != null ? (
            <span className="text-xl font-bold tabular-nums text-foreground">
              {fmt(product.minPrice)} <span className="text-sm font-normal text-muted-foreground">a</span>{" "}
              {fmt(product.maxPrice)}
            </span>
          ) : (
            <span className="text-xl font-bold tabular-nums text-foreground">{fmt(product.price)}</span>
          )}
          {product.originalPrice && product.originalPrice > product.price && !product.isPriceRange && (
            <span className="text-xs tabular-nums text-muted-foreground line-through">
              {fmt(product.originalPrice)}
            </span>
          )}
        </div>

        {ganhos && <BlocoDeComissao ganhos={ganhos} hasUpline={hasUpline} />}

        {modoCoach && product.pointsPerSale > 0 && (
          <div className="mb-3 rounded-xl bg-muted p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Carreira do coach
            </p>
            <p className="mt-0.5 text-xs text-foreground">
              <b className="text-primary">+{product.pointsPerSale} pontos</b> por venda, para
              premiações (jantar / viagem).
            </p>
          </div>
        )}

        {/* Gratuito não passa por carrinho: o resgate acontece na carteirinha,
            com QR e horário. Mandar para lá é mais honesto que simular uma
            compra de R$ 0 que o backend não conhece. */}
        {product.isFreebie && (
          <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <p className="text-xs font-bold text-emerald-500">Benefício gratuito</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {carteirinhaAtiva
                ? "Sua carteirinha está ativa. O resgate acontece na tela de gratuitos, com horário e QR."
                : "Para resgatar é preciso ter a carteirinha ativa — ela ativa na primeira compra. Você pode ver o benefício mesmo sem ela."}
            </p>
            <button
              type="button"
              onClick={onVerGratuitos}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white"
            >
              {carteirinhaAtiva ? "Resgatar" : "Ver na carteirinha"}
            </button>
          </div>
        )}

        {!product.isFreebie && product.isSchedulable && product.sellerCoachId && (
          <div className="mb-3">
            <AvailabilityPicker
              professionalCoachId={product.sellerCoachId}
              durationMinutes={product.durationMinutes}
              value={horario}
              onChange={setHorario}
            />
          </div>
        )}

        {product.isFreebie ? null : product.isSchedulable && !product.sellerCoachId ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-500">
            Este atendimento não tem profissional vinculado, então não há agenda para consultar.
          </p>
        ) : (
          <button
            type="button"
            onClick={async () => {
              setAdicionando(true);
              try { await onAdd(product, horario); } finally { setAdicionando(false); }
            }}
            disabled={semEstoque || (product.isSchedulable && !horario) || adicionando}
            title={product.isSchedulable && !horario ? "Escolha um horário antes de adicionar." : undefined}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {adicionando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            {semEstoque
              ? "Sem estoque"
              : product.isSchedulable && !horario
                ? "Escolha um horário"
                : noCarrinho
                  ? "Adicionar mais um"
                  : modoCoach ? "Adicionar à venda" : "Adicionar ao carrinho"}
          </button>
        )}

        {podeCurar && (
          <button
            type="button"
            onClick={onCurar}
            className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold ${
              escondidoDaRede
                ? "border-amber-500/40 text-amber-500"
                : "border-border text-muted-foreground"
            }`}
          >
            {escondidoDaRede ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {escondidoDaRede ? "Mostrar para minha rede" : "Esconder da minha rede"}
          </button>
        )}

        {podeIndicar && (
          <button
            type="button"
            onClick={onIndicar}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 px-4 py-2.5 text-xs font-bold text-primary"
          >
            <Share2 className="h-3.5 w-3.5" />
            Indicar e ganhar comissão
          </button>
        )}

        <p className="mt-3 rounded-xl bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
          O carrinho é o mesmo da loja atual: o que você montar aqui aparece lá, e o contrário
          também.
        </p>
      </div>
    </div>
  );
}

/**
 * Comissão do produto, para o coach.
 *
 * Começa FECHADO de propósito. O coach abre a loja na frente do aluno, e
 * número de comissão à mostra nessa hora é constrangimento — foi por isso que
 * a loja atual pôs um olho aqui, e não porque o dado seja secreto.
 */
function BlocoDeComissao({ ganhos, hasUpline }: { ganhos: Ganhos; hasUpline: boolean }) {
  const [revelado, setRevelado] = useState(false);
  const temNiveis = !hasUpline && (ganhos.extraPix > 0 || ganhos.extraCard > 0);

  return (
    <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <button
        type="button"
        onClick={() => setRevelado((v) => !v)}
        aria-expanded={revelado}
        className="flex w-full items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Comissões deste produto
          </span>
        </span>
        {revelado ? <EyeOff className="h-4 w-4 text-primary" /> : <Eye className="h-4 w-4 text-primary" />}
      </button>

      {revelado && (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
            {[
              { label: "Você", pix: ganhos.coachPix, card: ganhos.coachCard },
              { label: "Nível 1", pix: ganhos.l1Pix, card: ganhos.l1Card },
              { label: "Nível 2", pix: ganhos.l2Pix, card: ganhos.l2Card },
              { label: "Nível 3", pix: ganhos.l3Pix, card: ganhos.l3Card },
            ].map((c) => (
              <div key={c.label} className="rounded-lg bg-card p-2">
                <p className="text-muted-foreground">{c.label}</p>
                <p className="mt-1 flex items-center justify-between gap-1 text-[10px]">
                  <span className="text-muted-foreground">PIX</span>
                  <span className="font-bold tabular-nums text-foreground">{fmt(c.pix)}</span>
                </p>
                <p className="flex items-center justify-between gap-1 text-[10px]">
                  <span className="text-muted-foreground">Cartão</span>
                  <span className="font-bold tabular-nums text-foreground">{fmt(c.card)}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-lg bg-card p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sua comissão estimada (PIX)</span>
              <span className="font-bold tabular-nums text-primary">{fmt(ganhos.coachPix)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sua comissão estimada (Cartão)</span>
              <span className="font-bold tabular-nums text-primary">{fmt(ganhos.coachCard)}</span>
            </div>

            {temNiveis && (
              <>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">+ Níveis (sem upline) — PIX</span>
                  <span className="font-bold tabular-nums text-foreground">{fmt(ganhos.extraPix)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">+ Níveis (sem upline) — Cartão</span>
                  <span className="font-bold tabular-nums text-foreground">{fmt(ganhos.extraCard)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
                  <span className="text-foreground">Total estimado (PIX)</span>
                  <span className="font-bold tabular-nums text-primary">{fmt(ganhos.totalPix)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-foreground">Total estimado (Cartão)</span>
                  <span className="font-bold tabular-nums text-primary">{fmt(ganhos.totalCard)}</span>
                </div>
              </>
            )}

            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              Cálculo sobre o valor líquido (preço − taxas do app, cartão/PIX, reserva fiscal e
              custos). PIX não tem taxa de cartão, por isso a comissão é maior.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Carrinho.
 *
 * O aviso de quantos pedidos o carrinho vira fica ACIMA da lista, não no
 * rodapé: é informação que muda a decisão de comprar, e no rodapé ela chega
 * depois de a pessoa já ter decidido.
 */
type CheckoutProps = {
  paymentMethod: PaymentMethod;
  onPaymentMethod: (method: PaymentMethod) => void;
  precisaEntrega: boolean;
  shipping: ShippingForm;
  onShipping: (patch: Partial<ShippingForm>) => void;
  aceitouPrazo: boolean;
  onAceitouPrazo: (valor: boolean) => void;
  aceitouEndereco: boolean;
  onAceitouEndereco: (valor: boolean) => void;
  criando: boolean;
  onFinalizar: () => void;
  /** Venda do coach: muda o rótulo e exige aluno antes de qualquer pedido. */
  modoCoach: boolean;
  clienteNome: string | null;
  onTrocarCliente: () => void;
};

const CAMPOS_ENTREGA: Array<{ campo: keyof ShippingForm; label: string }> = [
  { campo: "name", label: "Nome" },
  { campo: "phone", label: "Telefone" },
  { campo: "zip", label: "CEP" },
  { campo: "address", label: "Logradouro" },
  { campo: "number", label: "Número" },
  { campo: "city", label: "Cidade" },
  { campo: "state", label: "UF" },
  { campo: "reference", label: "Referência (ex.: portão azul)" },
  { campo: "location_url", label: "Link do mapa (opcional)" },
];

function CartSheet({
  cart,
  subtotal,
  steps,
  onQuantidade,
  onRemover,
  onClose,
  checkout,
}: {
  cart: CartItem[];
  subtotal: number;
  steps: OrderStep[];
  onQuantidade: (id: string, delta: number) => void;
  onRemover: (id: string) => void;
  onClose: () => void;
  checkout: CheckoutProps;
}) {
  const multiplo = steps.length > 1;
  /** O primeiro pedido é o da FitMind? É ele que leva o endereço. */
  const entregaAgora = steps[0]?.key === "fitmind";

  return (
    <div
      className="modal-safe fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Carrinho"
      >
        <div className="modal-head -mx-5 -mt-5 mb-3 flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div>
            <h2 className="text-base font-bold text-foreground">Seu carrinho</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {cart.length === 0
                ? "Nada aqui ainda."
                : `${cart.length} ${cart.length === 1 ? "produto" : "produtos"} · ${fmt(subtotal)}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {checkout.modoCoach && (
          <button
            type="button"
            onClick={checkout.onTrocarCliente}
            className={`mb-3 flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ${
              checkout.clienteNome ? "bg-muted" : "border border-primary/30 bg-primary/10"
            }`}
          >
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                Venda para
              </span>
              <span className="block truncate text-sm font-bold text-foreground">
                {checkout.clienteNome || "Escolher aluno"}
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-bold text-primary">
              {checkout.clienteNome ? "Trocar" : "Escolher"}
            </span>
          </button>
        )}

        {multiplo && (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-[11px] font-bold text-amber-500">
              Este carrinho vira {steps.length} pedidos
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-amber-500/80">
              Cada vendedor recebe o pedido dele. Você paga um de cada vez — ao concluir um, o
              próximo abre em seguida.
            </p>
            <ul className="mt-2 space-y-0.5">
              {steps.map((step, index) => (
                <li key={step.key} className="text-[10px] text-amber-500/80">
                  {index + 1}. {step.label} ·{" "}
                  {fmt(step.items.reduce((soma, item) => soma + item.price * item.quantity, 0))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {cart.length === 0 ? (
          <p className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            Seu carrinho está vazio.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {cart.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5 rounded-xl bg-muted p-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <ShoppingBag className="h-4 w-4 text-muted-foreground opacity-50" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
                    {item.sellerName}
                  </p>
                  <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
                    {item.title}
                  </p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">{fmt(item.price)} cada</p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onQuantidade(item.id, -1)}
                    aria-label={`Diminuir ${item.title}`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-card"
                  >
                    <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <span className="w-5 text-center text-xs font-bold tabular-nums text-foreground">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onQuantidade(item.id, 1)}
                    aria-label={`Aumentar ${item.title}`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-card"
                  >
                    <Plus className="h-3.5 w-3.5 text-primary" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemover(item.id)}
                    aria-label={`Remover ${item.title}`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["pix", "credit_card", "debit_card"] as PaymentMethod[]).map((metodo) => (
                <button
                  key={metodo}
                  type="button"
                  onClick={() => checkout.onPaymentMethod(metodo)}
                  aria-pressed={checkout.paymentMethod === metodo}
                  className={`rounded-xl px-2 py-2 text-xs font-bold transition ${
                    checkout.paymentMethod === metodo
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {metodo === "pix" ? "PIX" : metodo === "credit_card" ? "Crédito" : "Débito"}
                </button>
              ))}
            </div>

            {/* Venda do coach não coleta endereço: `create_coach_sale` não
                recebe entrega. Mostrar o formulário aqui seria pedir um dado
                que não vai a lugar nenhum. */}
            {checkout.modoCoach && checkout.precisaEntrega && (
              <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-500">
                Há produto físico no carrinho. A venda do coach não coleta endereço — a entrega
                é combinada com o aluno depois, pelo painel de pedidos.
              </p>
            )}

            {!checkout.modoCoach && checkout.precisaEntrega && (
              <div className="mt-3 grid gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-bold text-primary">Entrega (produto físico)</p>
                {!entregaAgora && (
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    O endereço vale para o pedido da FitMind, que é o último da fila. Os pedidos
                    de parceiro vêm antes e não têm entrega.
                  </p>
                )}
                {CAMPOS_ENTREGA.map(({ campo, label }) => (
                  <input
                    key={campo}
                    value={checkout.shipping[campo] || ""}
                    onChange={(event) => checkout.onShipping({ [campo]: event.target.value })}
                    placeholder={label}
                    aria-label={label}
                    className="rounded-xl bg-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                ))}
                <label className="mt-1 flex items-start gap-2 text-[11px] text-foreground">
                  <input
                    type="checkbox"
                    checked={checkout.aceitouPrazo}
                    onChange={(event) => checkout.onAceitouPrazo(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Aceito que o produto será entregue neste endereço, respeitando o prazo médio
                    informado pelo vendedor.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[11px] text-foreground">
                  <input
                    type="checkbox"
                    checked={checkout.aceitouEndereco}
                    onChange={(event) => checkout.onAceitouEndereco(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>Declaro que preenchi corretamente os dados de localização.</span>
                </label>
              </div>
            )}

            <div className="mt-3 rounded-xl bg-muted p-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <b className="tabular-nums text-primary">{fmt(subtotal)}</b>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                Taxas de cartão são aplicadas no checkout, não aqui.
              </p>
            </div>
          </>
        )}

        <div className="modal-foot -mx-5 -mb-5 mt-3 flex gap-2 px-5 pb-5 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-muted px-4 py-3 text-sm font-bold text-foreground"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={checkout.onFinalizar}
            disabled={cart.length === 0 || checkout.criando}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {checkout.criando
              ? "Processando…"
              : checkout.modoCoach && !checkout.clienteNome
                ? "Selecionar aluno →"
                : multiplo
                  ? `Pagar 1 de ${steps.length}`
                  : "Finalizar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Pagamento de um pedido.
 *
 * Diz quantos pedidos ainda faltam. Sem isso, quem paga o primeiro de três
 * acha que terminou — e é exatamente aí que a compra é abandonada.
 */
function PaySheet({
  order,
  paymentMethod,
  restante,
  cliente,
  onPaid,
  onClose,
}: {
  order: PayOrder;
  paymentMethod: PaymentMethod;
  restante: number;
  /** Preenchido só na venda do coach — habilita o link de pagamento do aluno. */
  cliente: SaleClient | null;
  onPaid: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-safe fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5"
        role="dialog"
        aria-modal="true"
        aria-label="Pagamento"
      >
        <div className="modal-head -mx-5 -mt-5 mb-4 flex items-center justify-between px-5 pb-3 pt-5">
          <div>
            <h2 className="text-base font-bold text-foreground">Pagamento</h2>
            <p className="text-xs text-muted-foreground">Pedido {order.number || "—"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-foreground"
          >
            Fechar
          </button>
        </div>

        {restante > 0 && (
          <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-500">
            Este é o pedido de um vendedor. Ainda {restante === 1 ? "falta 1 pedido" : `faltam ${restante} pedidos`}{" "}
            depois deste — o próximo abre assim que você concluir.
          </p>
        )}

        <div className="mb-3">
          <WalletPayButton
            orderId={order.id}
            amount={order.total}
            kind={order.sourceKind === "store_order" ? "store" : "partner"}
            onPaid={onPaid}
          />
        </div>

        <MercadoPagoCheckout
          source={{ kind: order.sourceKind, id: order.id }}
          amount={order.total}
          description={`Pedido ${order.number}`}
          defaultPayer={{ email: order.email, name: order.name }}
          initialMethod={paymentMethod === "pix" ? "pix" : "card"}
          onApproved={() => { toast.success("Pagamento aprovado!"); onPaid(); }}
        />

        {cliente && !order.number && (
          <p className="mt-4 rounded-xl bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
            Número do pedido indisponível no momento. Recarregue a tela para gerar o link de
            pagamento do cliente.
          </p>
        )}

        {cliente && !!order.number && <LinkDePagamento order={order} cliente={cliente} />}
      </div>
    </div>
  );
}

/**
 * Link para o aluno pagar sozinho.
 *
 * Existe porque a venda do coach quase nunca termina na tela do coach: ele
 * registra a venda com o aluno na frente ou por mensagem, e quem paga é o
 * aluno, no aparelho dele. Sem o link, a venda criada fica pendente para
 * sempre.
 */
function LinkDePagamento({ order, cliente }: { order: PayOrder; cliente: SaleClient }) {
  const link = `${getShareOrigin()}/pay/${order.number}`;
  const telefone = cliente.phone?.replace(/\D/g, "") || "";
  const mensagem = encodeURIComponent(
    `Olá ${cliente.name || ""}! Segue o link para finalizar seu pagamento:\n\n${link}`,
  );
  const whatsapp = telefone ? `https://wa.me/55${telefone}?text=${mensagem}` : `https://wa.me/?text=${mensagem}`;

  return (
    <div className="mt-4 space-y-3 rounded-xl bg-muted p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Link de pagamento do cliente
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <span className="flex-1 truncate font-mono text-[11px] text-primary">{link}</span>
        <button
          type="button"
          onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copiado!"); }}
          className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/20"
        >
          Copiar
        </button>
      </div>
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white hover:bg-[#20bd5a]"
      >
        {telefone ? `Enviar pelo WhatsApp para ${cliente.name}` : "Enviar pelo WhatsApp (sem telefone)"}
      </a>
    </div>
  );
}

/**
 * Seletor de aluno da venda.
 *
 * Cópia do `ClientPickerModal` da loja atual. A aba "todos os clientes" só
 * aparece para master coach, e a busca por CPF foi deixada de fora de
 * propósito: LGPD — não se descobre pessoa por CPF.
 */
function ClientPickerSheet({
  clients,
  isMaster,
  carregando,
  onPick,
  onClose,
}: {
  clients: SaleClient[];
  isMaster: boolean;
  carregando: boolean;
  onPick: (cliente: SaleClient) => void;
  onClose: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<"meus" | "todos">("meus");
  const [todos, setTodos] = useState<SaleClient[]>([]);
  const [buscando, setBuscando] = useState(false);
  const soDigitos = (s: string) => s.replace(/\D/g, "");

  const meus = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return clients;
    const digitos = soDigitos(termo);
    return clients.filter((c) =>
      c.name.toLowerCase().includes(termo)
      || (!!c.email && c.email.toLowerCase().includes(termo))
      || (digitos.length > 0 && !!c.phone && soDigitos(c.phone).includes(digitos)));
  }, [clients, busca]);

  // Master coach busca no banco inteiro, com atraso para não disparar uma
  // consulta por tecla.
  useEffect(() => {
    if (!isMaster || aba !== "todos") return;
    const handle = setTimeout(async () => {
      setBuscando(true);
      const { data, error } = await supabase.rpc("list_all_students_for_master" as never, { _q: busca } as never);
      setBuscando(false);
      if (error) { toast.error(error.message || "Erro na busca"); return; }
      setTodos(((data || []) as Array<Record<string, unknown>>).map((s) => ({
        id: String(s.id),
        name: (s.name as string) || "Cliente",
        email: (s.email as string) || null,
        phone: (s.phone as string) || null,
        cpf: (s.cpf as string) || null,
      })));
    }, 250);
    return () => clearTimeout(handle);
  }, [isMaster, aba, busca]);

  const lista = aba === "todos" ? todos : meus;

  return (
    <div
      className="modal-safe fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Selecione o aluno"
      >
        <div className="modal-head -mx-5 -mt-5 mb-3 flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <h2 className="text-base font-bold text-foreground">Selecione o aluno</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {isMaster && (
          <div className="mb-3 flex rounded-lg bg-muted p-0.5">
            {([["meus", "Meus clientes"], ["todos", "Todos os clientes"]] as const).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAba(id)}
                aria-pressed={aba === id}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${
                  aba === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        )}

        <div className="mb-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail…"
            aria-label="Buscar aluno"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {carregando && aba === "meus" ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando seus alunos…</p>
        ) : aba === "meus" && clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não tem alunos vinculados.</p>
        ) : aba === "todos" && buscando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Buscando…</p>
        ) : lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {aba === "todos" && !busca ? "Digite para buscar entre todos os alunos." : "Nenhum aluno encontrado."}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {lista.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c)}
                className="w-full rounded-xl bg-muted p-3 text-left transition-colors hover:bg-accent"
              >
                <p className="text-sm font-bold text-foreground">{c.name}</p>
                {c.coachName && <p className="text-[11px] font-semibold text-primary">Coach: {c.coachName}</p>}
                {c.email && <p className="text-[11px] text-muted-foreground">{c.email}</p>}
                {c.cpf && <p className="text-[11px] text-muted-foreground">CPF: {maskCPFSensitive(c.cpf)}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Vendas já feitas por este coach. */
function CoachSalesPanel({ sales }: { sales: CoachSaleRow[] }) {
  return (
    <section className="rounded-2xl bg-card p-4">
      <h2 className="mb-3 text-sm font-bold text-foreground">Minhas vendas</h2>
      {sales.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma venda registrada ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sales.map((s) => (
            <div key={s.orderId} className="rounded-xl bg-muted p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-bold text-foreground">{s.clientName}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                    s.status === "paid" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {s.status}
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{s.productTitles}</p>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">
                  {s.createdAt ? new Date(s.createdAt).toLocaleDateString("pt-BR") : ""}
                </span>
                <span className="font-bold tabular-nums text-foreground">{fmt(s.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default UnifiedStorePage;
