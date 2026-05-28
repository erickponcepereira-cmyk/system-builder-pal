import { createFileRoute } from "@tanstack/react-router";
import { FitmindCalendar } from "@/components/FitmindCalendar";

export const Route = createFileRoute("/student/calendar")({
  head: () => ({
    meta: [
      { title: "Calendário de Eventos — FitMind Club" },
      { name: "description", content: "Eventos gratuitos da FitMind para toda a comunidade." },
    ],
  }),
  component: StudentCalendarPage,
});

function StudentCalendarPage() {
  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <FitmindCalendar />
    </div>
  );
}
