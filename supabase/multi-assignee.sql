-- Multi-assignee migration
-- Adds assignee_ids uuid[] column to tasks.
-- Keeps assignee_id as the primary (first) assignee for backward compat
-- (daily reminders and other FK-join queries still work unchanged).

-- 1. Add the array column
alter table public.tasks
  add column if not exists assignee_ids uuid[] default '{}';

-- 2. Back-fill from existing single assignee_id
update public.tasks
  set assignee_ids = array[assignee_id]
  where assignee_id is not null
    and (assignee_ids is null or assignee_ids = '{}');

-- 3. Allow realtime to broadcast this column (tasks table already in realtime publication)
-- No extra steps needed — the publication covers the entire table.
