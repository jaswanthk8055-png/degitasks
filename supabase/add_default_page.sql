-- Migration: Add default_page preference to profiles
-- Run this in your Supabase SQL Editor for existing databases

alter table public.profiles
  add column if not exists default_page text default 'Main Table';
