import { createFileRoute } from "@tanstack/react-router";
import { StorePage } from "@/components/student/StorePage";

/**
 * A loja anterior, mantida de pé.
 *
 * Saída de emergência do lançamento da loja unificada: se aparecer em produção
 * algo que a nova não cobre, esta rota está aqui e funciona, sem depender de
 * reverter commit nenhum.
 *
 * Não tem link no menu de propósito — quem precisa dela sabe o caminho. Ela
 * existe para não haver um momento em que a resposta seja "espera o deploy".
 *
 * Quando a loja nova acumular semanas sem incidente, esta rota e o
 * `StorePage.tsx` saem juntos. Enquanto isso, as duas leem o mesmo carrinho,
 * então trocar de uma para a outra não perde o que a pessoa montou.
 */
export const Route = createFileRoute("/_authenticated/student/loja-antiga")({
  validateSearch: (search: Record<string, unknown>): { produto?: string; checkout?: string } => ({
    ...(typeof search.produto === "string" ? { produto: search.produto } : {}),
    ...(search.checkout === "1" || search.checkout === 1 ? { checkout: "1" } : {}),
  }),
  component: LojaAntiga,
});

function LojaAntiga() {
  const { produto, checkout } = Route.useSearch();
  return <StorePage requestedProductId={produto} openCheckout={checkout === "1"} />;
}
