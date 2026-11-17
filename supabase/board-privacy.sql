-- Board privacy. Run after schema.sql, phase2.sql, phase3.sql, and multi-assignee.sql.
-- Existing boards remain public. Restrictive policies add privacy checks even if
-- a deployment has additional permissive policies; they do not grant access.
begin;

alter table public.boards add column if not exists visibility text;
update public.boards set visibility = 'public' where visibility is null;
alter table public.boards alter column visibility set default 'public';
alter table public.boards alter column visibility set not null;
alter table public.boards drop constraint if exists boards_visibility_check;
alter table public.boards add constraint boards_visibility_check check (visibility in ('public', 'private'));

-- The creator and privacy setting cannot be transferred or changed through a
-- client update. This also prevents making another user's public board private.
create or replace function public.protect_board_privacy()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and (new.created_by is distinct from old.created_by
      or new.workspace_id is distinct from old.workspace_id
      or new.visibility is distinct from old.visibility) then
    raise exception 'Board creator, workspace, and visibility cannot be changed';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_board_privacy on public.boards;
create trigger protect_board_privacy before update on public.boards
for each row execute function public.protect_board_privacy();

-- Ensure RLS cannot be disabled accidentally in an older installation.
alter table public.boards enable row level security;
alter table public.groups enable row level security;
alter table public.sub_groups enable row level security;
alter table public.tasks enable row level security;
alter table public.board_columns enable row level security;
alter table public.task_column_values enable row level security;
alter table public.comments enable row level security;
alter table public.activity_log enable row level security;
alter table public.notifications enable row level security;

-- Access to the board itself still depends on the existing workspace policies.
drop policy if exists board_privacy_guard on public.boards;
create policy board_privacy_guard on public.boards as restrictive for all to public
  using (auth.uid() is not null and (visibility = 'public' or created_by = auth.uid()))
  with check (auth.uid() is not null and (visibility = 'public' or created_by = auth.uid()));
drop policy if exists board_creator_guard on public.boards;
create policy board_creator_guard on public.boards as restrictive for insert to public
  with check (created_by = auth.uid());

-- A visible board is necessary for every board-owned row. Subqueries are
-- evaluated as the caller, so they inherit board/task RLS and workspace access.
drop policy if exists board_privacy_guard on public.groups;
create policy board_privacy_guard on public.groups as restrictive for all to public
  using (board_id in (select id from public.boards))
  with check (board_id in (select id from public.boards));
drop policy if exists board_privacy_guard on public.sub_groups;
create policy board_privacy_guard on public.sub_groups as restrictive for all to public
  using (board_id in (select id from public.boards))
  with check (board_id in (select id from public.boards)
    and (group_id is null or exists (select 1 from public.groups g
      where g.id = sub_groups.group_id and g.board_id = sub_groups.board_id)));
drop policy if exists board_privacy_guard on public.tasks;
create policy board_privacy_guard on public.tasks as restrictive for all to public
  using (board_id in (select id from public.boards))
  with check (exists (
    select 1 from public.boards b where b.id = tasks.board_id
      and (b.visibility = 'public' or (
        (tasks.assignee_id is null or tasks.assignee_id = b.created_by)
        and coalesce(tasks.assignee_ids, '{}'::uuid[]) <@ array[b.created_by]
      ))
      and (tasks.group_id is null or exists (select 1 from public.groups g
        where g.id = tasks.group_id and g.board_id = tasks.board_id))
      and (tasks.sub_group_id is null or exists (select 1 from public.sub_groups sg
        where sg.id = tasks.sub_group_id and sg.board_id = tasks.board_id
          and sg.group_id = tasks.group_id))
  ));
drop policy if exists board_privacy_guard on public.board_columns;
create policy board_privacy_guard on public.board_columns as restrictive for all to public
  using (board_id in (select id from public.boards))
  with check (board_id in (select id from public.boards));
drop policy if exists board_privacy_guard on public.task_column_values;
create policy board_privacy_guard on public.task_column_values as restrictive for all to public
  using (exists (
    select 1 from public.tasks t join public.board_columns c on c.board_id = t.board_id
    where t.id = task_column_values.task_id and c.id = task_column_values.column_id
  ))
  with check (exists (
    select 1 from public.tasks t join public.board_columns c on c.board_id = t.board_id
    where t.id = task_column_values.task_id and c.id = task_column_values.column_id
  ));
drop policy if exists board_privacy_guard on public.comments;
create policy board_privacy_guard on public.comments as restrictive for all to public
  using (task_id in (select id from public.tasks))
  with check (task_id in (select id from public.tasks));

-- Do not allow a task to be moved between boards, which could publish a
-- private task or introduce a private task into another board's metadata.
create or replace function public.protect_task_board()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and new.board_id is distinct from old.board_id then
    raise exception 'Tasks cannot be moved between boards';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_task_board on public.tasks;
create trigger protect_task_board before update on public.tasks
for each row execute function public.protect_task_board();

-- Activity entries retain their board after a task is deleted, so task titles
-- in historical metadata stay private too.
drop policy if exists board_privacy_guard on public.activity_log;
create policy board_privacy_guard on public.activity_log as restrictive for all to public
  using (auth.uid() is not null and (board_id is null or board_id in (select id from public.boards))
    and (task_id is null or task_id in (select id from public.tasks)))
  with check (auth.uid() is not null and (board_id is null or board_id in (select id from public.boards))
    and (task_id is null or exists (select 1 from public.tasks t
      where t.id = activity_log.task_id and t.board_id = activity_log.board_id)));

-- A notification for a private task can only be addressed to its owner.
drop policy if exists board_privacy_guard on public.notifications;
create policy board_privacy_guard on public.notifications as restrictive for all to public
  using (auth.uid() is not null and (task_id is null or task_id in (select id from public.tasks)))
  with check (auth.uid() is not null and (task_id is null or exists (
    select 1 from public.tasks t join public.boards b on b.id = t.board_id
    where t.id = notifications.task_id
      and (b.visibility = 'public' or notifications.user_id = b.created_by)
  )));
commit;
