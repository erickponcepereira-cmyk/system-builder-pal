ALTER PUBLICATION supabase_realtime ADD TABLE public.coaches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.coaches REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;