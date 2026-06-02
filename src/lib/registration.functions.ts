import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const registrationSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["coach", "student"]),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  cpf: z.string().optional().nullable(),
  birthdate: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  number: z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  coach: z
    .object({
      uplineCoachId: z.string().uuid(),
      pixKey: z.string().optional().nullable(),
      pixKeyType: z.string().optional().nullable(),
      bankName: z.string().optional().nullable(),
      bankAgency: z.string().optional().nullable(),
      bankAccount: z.string().optional().nullable(),
      bankAccountType: z.string().optional().nullable(),
      referralCode: z.string().optional().nullable(),
      referralLink: z.string().optional().nullable(),
      completedCoachCourse: z.boolean().optional(),
      coachCourseNotes: z.string().optional().nullable(),
      isProfessional: z.boolean().optional(),
      specialtyKey: z.string().optional().nullable(),
      specialtyCustomDescription: z.string().max(500).optional().nullable(),
      professionalCouncil: z.string().optional().nullable(),
      councilNumber: z.string().optional().nullable(),
    })
    .optional(),
  student: z
    .object({
      coachId: z.string().uuid(),
      referredByStudentId: z.string().uuid().optional().nullable(),
      referralCode: z.string().optional().nullable(),
      partnerId: z.string().uuid().optional().nullable(),
    })
    .optional(),
});

export const finalizeRegistrationFn = createServerFn({ method: "POST" })
  .inputValidator((data) => registrationSchema.parse(data))
  .handler(async ({ data }) => {
    const { finalizeRegistration } = await import("./registration.server");
    return finalizeRegistration(data);
  });
