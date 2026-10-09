-- Extend nightly empty-task cleanup to projects with no task references.
-- Run as postgres after cleanup-empty-tasks.sql and the project schema.
-- This migration does NOT delete projects or tasks immediately.
-- The existing single job runs at midnight Asia/Kolkata (18:30 UTC), removing
-- qualifying empty tasks first and then projects that have become empty.
-- New projects receive 24 hours of protection; legacy projects without a
-- creation timestamp are eligible at the first midnight if they have no tasks.
-- All task statuses and child tasks protect their referenced projects.
-- See cleanup-empty-projects.md for the read-only dry run and rollout.

begin;

create extension if not exists pg_cron;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Install empty-project cleanup as the postgres database role';
  end if;
  if to_regprocedure('degitasks_maintenance.cleanup_empty_tasks()') is null then
    raise exception 'Install cleanup-empty-tasks.sql before empty-project cleanup';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_constraint fk
    join pg_catalog.pg_attribute task_column
      on task_column.attrelid = fk.conrelid and task_column.attname = 'sub_group_id'
    join pg_catalog.pg_attribute project_column
      on project_column.attrelid = fk.confrelid and project_column.attname = 'id'
    where fk.contype = 'f' and fk.convalidated
      and fk.conrelid = 'public.tasks'::regclass
      and fk.confrelid = 'public.sub_groups'::regclass
      and fk.conkey = array[task_column.attnum]::smallint[]
      and fk.confkey = array[project_column.attnum]::smallint[]
  ) then
    raise exception 'Empty-project cleanup requires a validated tasks.sub_group_id foreign key to sub_groups.id';
  end if;
end;
$$;

-- Add the nullable column without a default first: pre-existing rows retain
-- NULL because their original creation times are unknown. Future inserts get
-- a real timestamp without requiring application changes. Never reset dates
-- when the migration is rerun.
alter table public.sub_groups add column if not exists created_at timestamptz;
alter table public.sub_groups alter column created_at set default now();

-- PostgreSQL does not automatically index the referencing side of a FK.
create index if not exists tasks_sub_group_id_cleanup_idx on public.tasks (sub_group_id);

create schema if not exists degitasks_maintenance;
revoke all on schema degitasks_maintenance from public, anon, authenticated, service_role;

create or replace function degitasks_maintenance.is_empty_project(
  project public.sub_groups,
  as_of timestamptz
)
returns boolean
language sql stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    (greatest(project.created_at, (to_jsonb(project) ->> 'updated_at')::timestamptz) is null
      or greatest(project.created_at, (to_jsonb(project) ->> 'updated_at')::timestamptz)
        <= as_of - interval '24 hours')
    and not exists (
      select 1 from public.tasks t where t.sub_group_id = project.id
    ),
    false
  );
$$;

create or replace function degitasks_maintenance.empty_project_candidates(
  as_of timestamptz default now()
)
returns table (project_id uuid, board_id uuid, group_id uuid, name text, created_at timestamptz)
language sql stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select sg.id, sg.board_id, sg.group_id, sg.name, sg.created_at
  from public.sub_groups sg
  where degitasks_maintenance.is_empty_project(sg, as_of);
$$;

create or replace function degitasks_maintenance.cleanup_empty_projects()
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  candidate_id uuid;
  affected bigint;
  deleted_count bigint := 0;
  cutoff timestamptz := now();
begin
  -- The validated task FK acquires a key-share lock on its project. FOR UPDATE
  -- conflicts with that lock: skip projects with a pending task save, and block
  -- new references while rechecking/deleting. This also protects schemas whose
  -- FK uses ON DELETE CASCADE, without cascading into any task.
  for candidate_id in
    select sg.id from public.sub_groups sg
    where degitasks_maintenance.is_empty_project(sg, cutoff)
    for update of sg skip locked
  loop
    delete from public.sub_groups sg
    where sg.id = candidate_id
      and degitasks_maintenance.is_empty_project(sg, cutoff);
    get diagnostics affected = row_count;
    deleted_count := deleted_count + affected;
  end loop;
  raise log 'DegiTasks empty-project cleanup removed % project(s)', deleted_count;
  return deleted_count;
end;
$$;

create or replace function degitasks_maintenance.cleanup_empty_tasks_and_projects()
returns table (deleted_tasks bigint, deleted_projects bigint)
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  deleted_tasks := degitasks_maintenance.cleanup_empty_tasks();
  deleted_projects := degitasks_maintenance.cleanup_empty_projects();
  return next;
end;
$$;

revoke all on all functions in schema degitasks_maintenance
  from public, anon, authenticated, service_role;

-- Reuse the existing job name to keep exactly one ordered maintenance job.
do $$
begin
  if coalesce(current_setting('cron.timezone', true), 'GMT') not in ('GMT', 'UTC', 'Etc/UTC') then
    raise exception 'Expected pg_cron timezone UTC/GMT; review the midnight Asia/Kolkata schedule before installing';
  end if;
  if exists (select 1 from cron.job where jobname = 'cleanup-empty-tasks') then
    perform cron.unschedule('cleanup-empty-tasks');
  end if;
end;
$$;

select cron.schedule(
  'cleanup-empty-tasks',
  '30 18 * * *',
  'select * from degitasks_maintenance.cleanup_empty_tasks_and_projects();'
);

commit;
