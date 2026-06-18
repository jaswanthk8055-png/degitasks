-- Migration: per-user notification preferences
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preference TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS teams_webhook_url TEXT;

-- notification_preference values: 'email' | 'teams' | 'both'
-- teams_webhook_url: personal Teams Incoming Webhook URL (nullable)

COMMENT ON COLUMN public.profiles.notification_preference IS
  'How the user wants to receive daily task reminders: email, teams, or both';
COMMENT ON COLUMN public.profiles.teams_webhook_url IS
  'Personal Teams Incoming Webhook URL for per-user morning reminder cards';
