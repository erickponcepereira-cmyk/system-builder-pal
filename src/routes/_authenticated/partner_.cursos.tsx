import { createFileRoute } from "@tanstack/react-router";
import { CreatorCoursesPanel } from "@/components/store/CreatorCoursesPanel";

/**
 * Cursos do parceiro — rota real, sem o gate de teste.
 *
 * A permissão de verdade está no banco: `can_manage_digital_product` decide o
 * que a pessoa consegue editar, e `criar_curso` recusa quem não é parceiro nem
 * profissional. Um gate de tela aqui seria uma segunda fonte de verdade.
 */
export const Route = createFileRoute("/_authenticated/partner_/cursos")({
  component: PartnerCourses,
});

function PartnerCourses() {
  return <CreatorCoursesPanel role="partner" />;
}
