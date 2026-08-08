SELECT cron.unschedule('recurring-charge-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recurring-charge-daily');

SELECT cron.schedule(
  'recurring-charge-daily',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--57e54ea4-86cc-4948-814d-71b2815329a0.lovable.app/api/public/hooks/recurring-charge',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15cXlqaWZ2cmx3dmVzcnd1YnNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzU5NzQsImV4cCI6MjA5MTc1MTk3NH0.TRlaXiUyycMxdPQD0GlprR6_PZYZp422qrlneUGesps"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);