import { createFileRoute } from "@tanstack/react-router";
import { MyCourses } from "@/components/store/MyCourses";

export const Route = createFileRoute("/_authenticated/student/library")({
  component: MyCourses,
});
