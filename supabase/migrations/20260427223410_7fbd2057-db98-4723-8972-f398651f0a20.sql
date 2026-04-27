DROP TRIGGER IF EXISTS set_student_referral_code ON public.students;
CREATE TRIGGER set_student_referral_code
  BEFORE INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_student_referral_code();

DROP TRIGGER IF EXISTS on_student_created_create_wallet ON public.students;
CREATE TRIGGER on_student_created_create_wallet
  AFTER INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.create_student_wallet();

DROP TRIGGER IF EXISTS update_students_updated_at ON public.students;
CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();