import { createFileRoute, Outlet } from "@tanstack/react-router";
import { MobileShell } from "@/components/student/MobileShell";

export const Route = createFileRoute("/student")({
  head: () => ({
    meta: [
      { title: "Minha Área — FitChain" },
      { name: "description", content: "Acompanhe seu desafio fitness." },
    ],
  }),
  component: StudentLayout,
});

function StudentLayout() {
  return (
    <MobileShell>
      <Outlet />
    </MobileShell>
  );
}
