-- ─────────────────────────────────────────────
-- PHASE 2 ADDITIONS
-- Run this in your Supabase SQL Editor (after the main schema.sql)
-- ─────────────────────────────────────────────

-- Add description column to tasks
alter table public.tasks add column if not exists description text;

-- ─────────────────────────────────────────────
-- NEW TABLES
-- ─────────────────────────────────────────────

-- Comments (for task detail panel Updates section)
create table if not exists public.comments (
  id         uuid primary key default uuid_generate_v4(),
  task_id    uuid references public.tasks(id) on delete cascade not null,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  body       text not null,
  created_at timestamptz default now()
);

-- Activity log (workspace-level event history)
create table if not exists public.activity_log (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  board_id     uuid references public.boards(id) on delete cascade,
  task_id      uuid references public.tasks(id) on delete set null,
  user_id      uuid references public.profiles(id) on delete set null,
  action       text not null,
  meta         jsonb default '{}',
  created_at   timestamptz default now()
);

-- Notifications (per-user in-app alerts)
create table if not exists public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references public.profiles(id) on delete cascade not null,
  message    text not null,
  read       boolean default false,
  task_id    uuid references public.tasks(id) on delete set null,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

alter table public.comments enable row level security;
alter table public.activity_log enable row level security;
alter table public.notifications enable row level security;

-- Comments: any workspace member can read/write comments on tasks they can see
create policy "comments_select" on public.comments for select
  using (task_id in (select id from public.tasks));
create policy "comments_insert" on public.comments for insert
  with check (user_id = auth.uid() and task_id in (select id from public.tasks));
create policy "comments_update" on public.comments for update
  using (user_id = auth.uid());
create policy "comments_delete" on public.comments for delete
  using (user_id = auth.uid());

-- Activity log: workspace members can read; any authenticated user can insert their own
create policy "activity_log_select" on public.activity_log for select
  using (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
      union
      select id from public.workspaces where owner_id = auth.uid()
    )
  );
create policy "activity_log_insert" on public.activity_log for insert
  with check (user_id = auth.uid());

-- Notifications: users can only see and update their own; anyone can insert (to notify others)
create policy "notifications_select" on public.notifications for select
  using (user_id = auth.uid());
create policy "notifications_insert" on public.notifications for insert
  with check (true);
create policy "notifications_update" on public.notifications for update
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- REALTIME
-- ─────────────────────────────────────────────

alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.notifications;

-- ─────────────────────────────────────────────
-- RPC: look up a profile by email for the invite flow
-- (security definer allows reading auth.users without exposing it)
-- ─────────────────────────────────────────────

create or replace function public.get_profile_by_email(email_input text)
returns table(id uuid, full_name text, avatar_color text)
language plpgsql
security definer
as $$
begin
  return query
    select p.id, p.full_name, p.avatar_color
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) = lower(email_input)
    limit 1;
end;
$$;
