-- Enable required extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with same name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('career-reset-expired-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule daily reset of expired career period plans at 03:00 UTC
SELECT cron.schedule(
  'career-reset-expired-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--57e54ea4-86cc-4948-814d-71b2815329a0.lovable.app/api/public/career/reset-expired',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15cXlqaWZ2cmx3dmVzcnd1YnNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzU5NzQsImV4cCI6MjA5MTc1MTk3NH0.TRlaXiUyycMxdPQD0GlprR6_PZYZp422qrlneUGesps"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);