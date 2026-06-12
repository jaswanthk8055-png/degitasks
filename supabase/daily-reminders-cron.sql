-- Daily task reminder cron job
-- Runs at 03:00 UTC = 08:30 AM IST every day.
-- Run this in Supabase SQL Editor AFTER deploying the send-daily-reminders Edge Function.

-- Enable pg_cron and pg_net extensions (required once per project)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old job if it already exists (safe to re-run)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-reminders') THEN
    PERFORM cron.unschedule('send-daily-reminders');
  END IF;
END $$;

-- Schedule the cron job: 03:00 UTC = 08:30 AM IST, every day
SELECT cron.schedule(
  'send-daily-reminders',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://lnnsrocwsdpwojqavcqp.supabase.co/functions/v1/send-daily-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxubnNyb2N3c2Rwd29qcWF2Y3FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDMxNzcsImV4cCI6MjA5NjU3OTE3N30.OEoplIsoeGf--pg2kEqUvC-AI6Vpv1HaTqRb_bzo9r8'
    ),
    body    := '{}'::jsonb
  );
  $$
);
