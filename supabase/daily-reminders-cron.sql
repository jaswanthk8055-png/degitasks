-- Daily task reminder cron job
-- Runs at 03:00 UTC = 08:30 AM IST every day.
-- Prerequisites:
--   1. Deploy the Edge Function:  supabase functions deploy send-daily-reminders
--   2. Set secrets:
--        supabase secrets set RESEND_API_KEY=re_xxxx
--        supabase secrets set FROM_EMAIL="DegiTasks <no-reply@yourdomain.com>"
--        supabase secrets set APP_URL="https://your-app-url.com"
--   3. Run this SQL in Supabase SQL Editor.

-- Enable pg_cron and pg_net extensions (required once per project)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old job if it exists
SELECT cron.unschedule('send-daily-reminders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-daily-reminders'
);

-- Schedule the cron job: 03:00 UTC = 08:30 AM IST
SELECT cron.schedule(
  'send-daily-reminders',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/send-daily-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
    ),
    body   := '{}'::jsonb
  );
  $$
);
