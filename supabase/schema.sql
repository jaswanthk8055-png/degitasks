  -- DegiTasks Database Schema
  -- Run this in your Supabase SQL Editor

  -- Enable UUID extension
  create extension if not exists "uuid-ossp";

  -- ─────────────────────────────────────────────
  -- TABLES
  -- ─────────────────────────────────────────────

  -- Profiles (extends Supabase auth.users)
  create table if not exists public.profiles (
    id          uuid primary key references auth.users on delete cascade,
    full_name   text,
    avatar_color text default '#0073ea',
    created_at  timestamptz default now()
  );

  -- Workspaces
  create table if not exists public.workspaces (
    id         uuid primary key default uuid_generate_v4(),
    name       text not null,
    owner_id   uuid references public.profiles(id) on delete cascade,
    created_at timestamptz default now()
  );

  -- Workspace members
  create table if not exists public.workspace_members (
    workspace_id uuid references public.workspaces(id) on delete cascade,
    user_id      uuid references public.profiles(id) on delete cascade,
    role         text default 'member',
    primary key (workspace_id, user_id)
  );

  -- Boards
  create table if not exists public.boards (
    id           uuid primary key default uuid_generate_v4(),
    workspace_id uuid references public.workspaces(id) on delete cascade,
    name         text not null,
    icon         text default '📋',
    color        text default '#0073ea',
    created_by   uuid references public.profiles(id),
    created_at   timestamptz default now()
  );

  -- Task groups (sections within a board)
  create table if not exists public.groups (
    id       uuid primary key default uuid_generate_v4(),
    board_id uuid references public.boards(id) on delete cascade,
    name     text not null,
    color    text default '#0073ea',
    position int default 0
  );

  -- Tasks
  create table if not exists public.tasks (
    id            uuid primary key default uuid_generate_v4(),
    group_id      uuid references public.groups(id) on delete cascade,
    board_id      uuid references public.boards(id) on delete cascade,
    title         text not null,
    status        text default 'Not Started',
    status_color  text default '#c4c4c4',
    assignee_id   uuid references public.profiles(id) on delete set null,
    due_date      date,
    priority      text,
    position      int default 0,
    created_by    uuid references public.profiles(id),
    created_at    timestamptz default now(),
    updated_at    timestamptz default now()
  );

  -- ─────────────────────────────────────────────
  -- TRIGGERS
  -- ─────────────────────────────────────────────

  -- Auto-create profile on signup
  create or replace function public.handle_new_user()
  returns trigger as $$
  begin
    insert into public.profiles (id, full_name, avatar_color)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      '#0073ea'
    );
    return new;
  end;
  $$ language plpgsql security definer;

  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

  -- Auto-update updated_at on tasks
  create or replace function public.update_updated_at()
  returns trigger as $$
  begin
    new.updated_at = now();
    return new;
  end;
  $$ language plpgsql;

  drop trigger if exists tasks_updated_at on public.tasks;
  create trigger tasks_updated_at
    before update on public.tasks
    for each row execute procedure public.update_updated_at();

  -- ─────────────────────────────────────────────
  -- ROW LEVEL SECURITY
  -- ─────────────────────────────────────────────

  alter table public.profiles enable row level security;
  alter table public.workspaces enable row level security;
  alter table public.workspace_members enable row level security;
  alter table public.boards enable row level security;
  alter table public.groups enable row level security;
  alter table public.tasks enable row level security;

  -- Profiles: users can read all profiles, update only their own
  create policy "profiles_select" on public.profiles for select using (true);
  create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

  -- Workspaces: members can see their workspaces
  create policy "workspaces_select" on public.workspaces for select
    using (
      owner_id = auth.uid()
      or id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    );
  create policy "workspaces_insert" on public.workspaces for insert with check (owner_id = auth.uid());
  create policy "workspaces_update" on public.workspaces for update using (owner_id = auth.uid());
  create policy "workspaces_delete" on public.workspaces for delete using (owner_id = auth.uid());

  -- Workspace members
  create policy "workspace_members_select" on public.workspace_members for select
    using (user_id = auth.uid() or workspace_id in (select id from public.workspaces where owner_id = auth.uid()));
  create policy "workspace_members_insert" on public.workspace_members for insert
    with check (workspace_id in (select id from public.workspaces where owner_id = auth.uid()) or user_id = auth.uid());
  create policy "workspace_members_delete" on public.workspace_members for delete
    using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));

  -- Boards: workspace members can see boards
  create policy "boards_select" on public.boards for select
    using (
      workspace_id in (
        select workspace_id from public.workspace_members where user_id = auth.uid()
        union
        select id from public.workspaces where owner_id = auth.uid()
      )
    );
  create policy "boards_insert" on public.boards for insert
    with check (
      workspace_id in (
        select workspace_id from public.workspace_members where user_id = auth.uid()
        union
        select id from public.workspaces where owner_id = auth.uid()
      )
    );
  create policy "boards_update" on public.boards for update
    using (
      workspace_id in (
        select workspace_id from public.workspace_members where user_id = auth.uid()
        union
        select id from public.workspaces where owner_id = auth.uid()
      )
    );
  create policy "boards_delete" on public.boards for delete
    using (created_by = auth.uid());

  -- Groups: same workspace-member access
  create policy "groups_select" on public.groups for select
    using (board_id in (select id from public.boards));
  create policy "groups_insert" on public.groups for insert
    with check (board_id in (select id from public.boards));
  create policy "groups_update" on public.groups for update
    using (board_id in (select id from public.boards));
  create policy "groups_delete" on public.groups for delete
    using (board_id in (select id from public.boards));

  -- Tasks
  create policy "tasks_select" on public.tasks for select
    using (board_id in (select id from public.boards));
  create policy "tasks_insert" on public.tasks for insert
    with check (board_id in (select id from public.boards));
  create policy "tasks_update" on public.tasks for update
    using (board_id in (select id from public.boards));
  create policy "tasks_delete" on public.tasks for delete
    using (board_id in (select id from public.boards));

  -- ─────────────────────────────────────────────
  -- REALTIME
  -- ─────────────────────────────────────────────

  -- Enable realtime for tasks and groups
  alter publication supabase_realtime add table public.tasks;
  alter publication supabase_realtime add table public.groups;
  alter publication supabase_realtime add table public.boards;
