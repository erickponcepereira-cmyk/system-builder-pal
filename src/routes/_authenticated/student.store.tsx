import { createFileRoute } from "@tanstack/react-router";
import { StorePage } from "@/components/student/StorePage";

export const Route = createFileRoute("/student/store")({
  component: StorePage,
});
