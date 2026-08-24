import { createFileRoute } from "@tanstack/react-router";
import { UnifiedStorePage } from "@/components/store/UnifiedStorePage";
import { TestSurfaceGate } from "@/components/store/TestSurfaceGate";

/**
 * Loja nova do aluno.
 *
 * Aceita os mesmos parâmetros de busca da loja atual, e isso não é detalhe: são
 * os dois caminhos por onde a intenção chega de fora.
 *
 *   `?produto=<id>`  → veio de um link de indicação ou de um anúncio
 *   `?checkout=1`    → veio da loja pública com o carrinho montado
 *
 * A validação mora na rota, não no componente, porque é a rota que recebe a URL
 * — e porque parâmetro inválido tem de morrer antes de virar estado de tela.
 */
export const Route = createFileRoute("/_authenticated/student/loja-teste")({
  validateSearch: (search: Record<string, unknown>): { produto?: string; checkout?: string } => ({
    ...(typeof search.produto === "string" ? { produto: search.produto } : {}),
    ...(search.checkout === "1" || search.checkout === 1 ? { checkout: "1" } : {}),
  }),
  component: StudentTestStore,
});

function StudentTestStore() {
  const { produto, checkout } = Route.useSearch();
  return (
    <TestSurfaceGate>
      <UnifiedStorePage
        audience="student"
        requestedProductId={produto}
        openCheckout={checkout === "1"}
      />
    </TestSurfaceGate>
  );
}
