import { createFileRoute } from "@tanstack/react-router";
import { UnifiedStorePage } from "@/components/store/UnifiedStorePage";

/**
 * Loja do aluno.
 *
 * Desde 24/08/2026 esta rota serve a loja unificada. A troca foi feita AQUI, e
 * não na barra de navegação, de propósito: 14 pontos do app usam
 * `to="/student"` como "voltar ao início", 10 apontam para `/student/store`, e
 * o `post-auth-intent` gravado no navegador aponta para cá por até 2 horas.
 * Trocar o alvo da navegação teria deixado todos esses caminhos na loja antiga
 * — inclusive quem estivesse no meio de um cadastro.
 *
 * Trocando o que a rota renderiza, todo link existente passa a chegar na loja
 * nova sem que nenhum deles precise ser tocado.
 *
 * A loja antiga continua de pé em `/student/loja-antiga`. É a saída de
 * emergência: se algo aparecer em produção, a volta é trocar este componente,
 * sem precisar de deploy de vários arquivos.
 */
export const Route = createFileRoute("/_authenticated/student/store")({
  validateSearch: (search: Record<string, unknown>): { produto?: string; checkout?: string } => ({
    ...(typeof search.produto === "string" ? { produto: search.produto } : {}),
    ...(search.checkout === "1" || search.checkout === 1 ? { checkout: "1" } : {}),
  }),
  component: StudentStorePage,
});

function StudentStorePage() {
  const { produto, checkout } = Route.useSearch();
  return (
    <UnifiedStorePage
      audience="student"
      requestedProductId={produto}
      openCheckout={checkout === "1"}
    />
  );
}
