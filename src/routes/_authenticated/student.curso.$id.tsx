import { createFileRoute } from "@tanstack/react-router";
import { CoursePlayer } from "@/components/store/CoursePlayer";

export const Route = createFileRoute("/_authenticated/student/curso/$id")({
  component: StudentCourse,
});

function StudentCourse() {
  const { id } = Route.useParams();
  return <CoursePlayer productId={id} />;
}
