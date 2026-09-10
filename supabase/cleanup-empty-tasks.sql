-- Nightly cleanup of accidentally created empty task rows.
-- Run as postgres in the Supabase SQL Editor after schema.sql, phase2.sql,
-- phase3.sql and multi-assignee.sql. This does NOT run a deletion immediately.
-- The single named job runs daily at 00:00 Asia/Kolkata (18:30 UTC).
-- A task must have been untouched for at least 24 hours before it can qualify.
-- Assignment alone does not protect an otherwise empty task.
-- Projects/sub_groups, groups and boards are never deleted by this job.
-- See cleanup-empty-tasks.md for the dry run, rollout and regression tests.

begin;

create extension if not exists pg_cron;

-- Keep maintenance functions outside the public API. They are SECURITY INVOKER:
-- only the database owner/scheduler can execute them, without an elevated RPC.
create schema if not exists degitasks_maintenance;
revoke all on schema degitasks_maintenance from public, anon, authenticated, service_role;

create or replace function degitasks_maintenance.is_blank_text(value text)
returns boolean
language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select regexp_replace(
    coalesce(value, ''),
    '[[:space:]' || chr(160) || chr(8203) || chr(65279) || ']', '', 'g'
  ) = '';
$$;

create or replace function degitasks_maintenance.is_blank_description(value text)
returns boolean
language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $$
  -- Remove only the editor's empty formatting wrappers. Images, links, media,
  -- unknown markup and any actual text count as content and protect the task.
  select degitasks_maintenance.is_blank_text(
    regexp_replace(
      regexp_replace(coalesce(value, ''),
        '</?(p|div|br|span|strong|b|em|i|u|s|strike|blockquote|ul|ol|li|font)([[:space:]][^>]*)?/?>',
        '', 'gi'),
      '&(nbsp|#0*160|#x0*a0);', '', 'gi'
    )
  );
$$;

create or replace function degitasks_maintenance.is_empty_task(
  task public.tasks,
  as_of timestamptz
)
returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    task.created_at is not null
    and task.updated_at is not null
    and greatest(task.created_at, task.updated_at) <= as_of - interval '24 hours'
    and degitasks_maintenance.is_blank_text(task.title)
    and degitasks_maintenance.is_blank_description(task.description)
    and task.due_date is null
    and degitasks_maintenance.is_blank_text(task.priority)
    and coalesce(task.status, 'Not Started') = 'Not Started'
    and coalesce(task.status_color, '#c4c4c4') = '#c4c4c4'
    -- Preserve new/unrecognized fields automatically until explicitly reviewed.
    and jsonb_strip_nulls(to_jsonb(task) - array[
      'id', 'board_id', 'group_id', 'sub_group_id', 'position', 'created_by',
      'created_at', 'updated_at', 'title', 'description', 'due_date',
      'priority', 'status', 'status_color', 'assignee_id', 'assignee_ids'
    ]) = '{}'::jsonb
    -- Manual, automatic and multiple assignees are all allowed. Assignment
    -- updates still restart the grace period through the task's updated_at.
    -- Any saved comment/custom cell is an intentional interaction, even false,
    -- zero, or a deliberately cleared cell. Defaults create no child records.
    -- Live schemas can have child tasks with ON DELETE CASCADE. Keep a parent
    -- whenever it has any child, even an empty one. JSON lookup also works on
    -- older schemas without parent_task_id; non-null parent_task_id on a child
    -- remains protected by the unrecognized-field check above.
    and not exists (
      select 1 from public.tasks child
      where to_jsonb(child) ->> 'parent_task_id' = task.id::text
    )
    and not exists (select 1 from public.comments c where c.task_id = task.id)
    and not exists (select 1 from public.task_column_values v where v.task_id = task.id)
    and not exists (
      select 1 from public.activity_log activity
      where activity.task_id = task.id
        and (
          -- Assignment-only history is allowed, but evidence of a named task
          -- or any other recorded interaction continues to protect the row.
          activity.action not in ('task_created', 'task_assigned')
          or not degitasks_maintenance.is_blank_text(activity.meta ->> 'task_title')
        )
    ),
    false
  );
$$;

create or replace function degitasks_maintenance.empty_task_candidates(
  as_of timestamptz default now()
)
returns table (task_id uuid, board_id uuid, created_at timestamptz, updated_at timestamptz)
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select t.id, t.board_id, t.created_at, t.updated_at
  from public.tasks t
  where degitasks_maintenance.is_empty_task(t, as_of);
$$;

create or replace function degitasks_maintenance.cleanup_empty_tasks()
returns bigint
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  candidate_id uuid;
  affected bigint;
  deleted_count bigint := 0;
  cutoff timestamptz := now();
begin
  -- Skip tasks being saved. Once locked, new child tasks/comments/custom cells
  -- cannot acquire their task FK lock. Recheck so newly committed work
  -- is visible before deletion under the scheduler's READ COMMITTED isolation.
  for candidate_id in
    select t.id from public.tasks t
    where degitasks_maintenance.is_empty_task(t, cutoff)
    for update of t skip locked
  loop
    delete from public.tasks t
    where t.id = candidate_id
      and degitasks_maintenance.is_empty_task(t, cutoff);
    get diagnostics affected = row_count;
    deleted_count := deleted_count + affected;
  end loop;
  raise log 'DegiTasks empty-task cleanup removed % task(s)', deleted_count;
  return deleted_count;
end;
$$;

revoke all on all functions in schema degitasks_maintenance
  from public, anon, authenticated, service_role;

-- Fail explicitly if this project's scheduler is configured for another zone;
-- changing the session/database TimeZone alone does not change pg_cron time.
do $$
begin
  if coalesce(current_setting('cron.timezone', true), 'GMT') not in ('GMT', 'UTC', 'Etc/UTC') then
    raise exception 'Expected pg_cron timezone UTC/GMT; review the midnight Asia/Kolkata schedule before installing';
  end if;
  if current_user <> 'postgres' then
    raise exception 'Install empty-task cleanup as the postgres database role';
  end if;
  if exists (select 1 from cron.job where jobname = 'cleanup-empty-tasks') then
    perform cron.unschedule('cleanup-empty-tasks');
  end if;
end;
$$;

select cron.schedule(
  'cleanup-empty-tasks',
  '30 18 * * *',
  'select degitasks_maintenance.cleanup_empty_tasks();'
);

commit;
