-- Completed-task dates and a database fallback for reopened/misfiled tasks.
-- Run once in the Supabase SQL Editor before deploying the matching frontend.
-- Requires the existing tasks, groups and sub_groups (projects) tables.
-- Safe to rerun. Existing Done tasks retain unknown (NULL) completion dates;
-- updated_at is deliberately not treated as historical completion evidence.

begin;

alter table public.tasks add column if not exists completed_date date;

comment on column public.tasks.completed_date is
  'Editable completion date. New Done transitions default to today in Asia/Kolkata; reopening clears it.';

create or replace function public.enforce_task_completion()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  destination_is_completed boolean;
  source_project_name text;
  active_group_id uuid;
  active_project_id uuid;
begin
  select g.name ~* '^[[:space:]]*completed([[:space:]]+tasks)?[[:space:]]*$'
    into destination_is_completed
    from public.groups g
    where g.id = new.group_id;

  if new.status = 'Done' then
    if tg_op = 'INSERT' then
      new.completed_date := coalesce(new.completed_date, (now() at time zone 'Asia/Kolkata')::date);
    elsif old.status is distinct from 'Done' then
      new.completed_date := coalesce(new.completed_date, (now() at time zone 'Asia/Kolkata')::date);
    elsif new.group_id is distinct from old.group_id
      and destination_is_completed
      and old.completed_date is null
      and new.completed_date is null
      and not exists (
        select 1 from public.groups g
        where g.id = old.group_id
          and g.name ~* '^[[:space:]]*completed([[:space:]]+tasks)?[[:space:]]*$'
      ) then
      -- Covers moving a previously undated Done task into Completed Tasks.
      -- Editing/clearing the date on an existing completed task stays editable.
      new.completed_date := (now() at time zone 'Asia/Kolkata')::date;
    end if;
    return new;
  end if;

  new.completed_date := null;
  if not coalesce(destination_is_completed, false) then
    return new;
  end if;

  select sg.name into source_project_name
    from public.sub_groups sg
    where sg.id = new.sub_group_id and sg.board_id = new.board_id;

  -- Prefer an active section already containing the same project. Never move
  -- tasks/projects across boards, even if another board has the same name.
  select g.id into active_group_id
    from public.groups g
    where g.board_id = new.board_id
      and not (g.name ~* '^[[:space:]]*completed([[:space:]]+tasks)?[[:space:]]*$')
    order by exists (
      select 1 from public.sub_groups sg
      where sg.group_id = g.id and sg.board_id = new.board_id
        and lower(btrim(sg.name)) = lower(btrim(source_project_name))
    ) desc, g.position nulls last, g.id
    limit 1;

  if active_group_id is null then
    -- Serialize only fallback creation, then recheck in case another task
    -- created the section while this transaction waited.
    perform pg_advisory_xact_lock(hashtextextended('degitasks:active-group:' || new.board_id::text, 0));
    select g.id into active_group_id
      from public.groups g
      where g.board_id = new.board_id
        and not (g.name ~* '^[[:space:]]*completed([[:space:]]+tasks)?[[:space:]]*$')
      order by g.position nulls last, g.id limit 1;
    if active_group_id is null then
      insert into public.groups (board_id, name, color, position)
      select new.board_id, 'Tasks', '#0073ea', coalesce(max(g.position), -1) + 1
        from public.groups g where g.board_id = new.board_id
      returning id into active_group_id;
    end if;
  end if;

  if source_project_name is not null then
    -- Keep the task's project when returning it to an active section. Reuse a
    -- matching project or create one, without modifying the completed project.
    perform pg_advisory_xact_lock(hashtextextended('degitasks:active-project:' || active_group_id::text, 0));
    select sg.id into active_project_id
      from public.sub_groups sg
      where sg.group_id = active_group_id and sg.board_id = new.board_id
        and lower(btrim(sg.name)) = lower(btrim(source_project_name))
      order by sg.position nulls last, sg.id limit 1;
    if active_project_id is null then
      insert into public.sub_groups (board_id, group_id, name, position)
      select new.board_id, active_group_id, source_project_name, coalesce(max(sg.position), -1) + 1
        from public.sub_groups sg where sg.group_id = active_group_id and sg.board_id = new.board_id
      returning id into active_project_id;
    end if;
  end if;

  new.group_id := active_group_id;
  new.sub_group_id := active_project_id;
  select coalesce(max(t.position), -1) + 1 into new.position
    from public.tasks t
    where t.board_id = new.board_id and t.group_id = active_group_id and t.id <> new.id;
  return new;
end;
$$;

-- Trigger functions are not an API. In particular, no SECURITY DEFINER RPC
-- bypasses workspace policies: all routing uses the caller's normal RLS access.
revoke all on function public.enforce_task_completion() from public;

drop trigger if exists tasks_enforce_completion on public.tasks;
create trigger tasks_enforce_completion
  before insert or update on public.tasks
  for each row execute function public.enforce_task_completion();

-- Repair the screenshot's legacy case without inventing completion dates for
-- existing Done tasks or touching due dates, assignments and custom values.
update public.tasks t
  set status = t.status
  where t.status is distinct from 'Done'
    and exists (
      select 1 from public.groups g where g.id = t.group_id
        and g.name ~* '^[[:space:]]*completed([[:space:]]+tasks)?[[:space:]]*$'
    );

commit;
