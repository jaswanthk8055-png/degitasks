import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

// Synthetic in-memory PostgreSQL only; never reads .env or contacts Supabase.
const migration = await readFile(new URL('../completed-tasks.sql', import.meta.url), 'utf8')
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`

test('completed tasks: legacy repair, editable dates, reopening, project preservation and RLS', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table public.boards (id uuid primary key);
      create table public.groups (
        id uuid primary key default gen_random_uuid(),
        board_id uuid references public.boards, name text not null,
        color text default '#0073ea', position integer default 0
      );
      create table public.sub_groups (
        id uuid primary key default gen_random_uuid(),
        board_id uuid references public.boards,
        group_id uuid references public.groups, name text not null,
        position integer default 0
      );
      create table public.tasks (
        id uuid primary key default gen_random_uuid(),
        board_id uuid references public.boards,
        group_id uuid references public.groups,
        sub_group_id uuid references public.sub_groups,
        title text not null, status text default 'Not Started',
        status_color text, assignee_id uuid, assignee_ids uuid[],
        due_date date, description text, priority text,
        position integer default 0, created_by uuid,
        created_at timestamptz default now(), updated_at timestamptz default now(),
        custom_metadata jsonb
      );
      create table public.task_column_values (
        task_id uuid references public.tasks, value jsonb
      );
    `)
    const board = uuid(1)
    const otherBoard = uuid(2)
    const loneBoard = uuid(3)
    const firstGroup = uuid(11)
    const matchingGroup = uuid(12)
    const completedGroup = uuid(13)
    const similarlyNamedGroup = uuid(14)
    const otherActiveGroup = uuid(21)
    const otherCompletedGroup = uuid(22)
    const loneCompletedGroup = uuid(31)
    const completedProject = uuid(41)
    const matchingProject = uuid(42)
    const unmatchedProject = uuid(43)
    const otherProject = uuid(44)
    const loneProject = uuid(45)
    for (const id of [board, otherBoard, loneBoard]) {
      await db.query('insert into public.boards values ($1)', [id])
    }
    for (const [id, boardId, name, position] of [
      [firstGroup, board, 'Active Tasks', 0],
      [matchingGroup, board, 'Projects', 1],
      [completedGroup, board, 'Completed Tasks', 2],
      [similarlyNamedGroup, board, 'Completed Tasks Archive', 3],
      [otherActiveGroup, otherBoard, 'Active Tasks', 0],
      [otherCompletedGroup, otherBoard, 'COMPLETED', 1],
      [loneCompletedGroup, loneBoard, ' \tcompleted   tasks\n ', 0],
    ]) {
      await db.query('insert into public.groups (id, board_id, name, position) values ($1, $2, $3, $4)',
        [id, boardId, name, position])
    }
    for (const [id, boardId, groupId, name] of [
      [completedProject, board, completedGroup, 'PatGen'],
      [matchingProject, board, matchingGroup, ' patgen '],
      [unmatchedProject, board, completedGroup, 'TowGeom'],
      [otherProject, otherBoard, otherActiveGroup, 'TowGeom'],
      [loneProject, loneBoard, loneCompletedGroup, 'Lone Project'],
    ]) {
      await db.query('insert into public.sub_groups (id, board_id, group_id, name) values ($1, $2, $3, $4)',
        [id, boardId, groupId, name])
    }

    let taskSequence = 100
    async function add(overrides = {}) {
      const task = {
        id: uuid(++taskSequence), board_id: board, group_id: completedGroup,
        sub_group_id: null, title: 'A real task', status: 'Done', position: 0,
        created_at: '2025-01-01T00:00:00Z', updated_at: '2025-02-01T00:00:00Z',
        ...overrides,
      }
      await db.query('insert into public.tasks select (jsonb_populate_record(null::public.tasks, $1::jsonb)).*',
        [JSON.stringify(task)])
      return task.id
    }
    async function read(id) {
      return (await db.query('select to_jsonb(t) as task from public.tasks t where id = $1', [id])).rows[0].task
    }
    async function update(id, values) {
      const keys = Object.keys(values)
      await db.query(`update public.tasks set ${keys.map((key, index) => `${key} = $${index + 2}`).join(', ')} where id = $1`,
        [id, ...Object.values(values)])
      return read(id)
    }

    const preserved = {
      title: 'Fix the PatGen validation', description: '<p>Preserve details</p>',
      status: 'In Review', status_color: '#0086c0', due_date: '2026-10-09',
      assignee_id: uuid(900), assignee_ids: [uuid(900), uuid(901)],
      priority: 'High', custom_metadata: { untouched: true },
    }
    const historicalDone = await add({ sub_group_id: completedProject })
    const review = await add({ ...preserved, sub_group_id: completedProject })
    const unmatched = await add({ status: 'Following Up', sub_group_id: unmatchedProject })
    const unprojected = await add({ status: 'On Hold' })
    const nullStatus = await add({ status: null })
    const lookalike = await add({ group_id: similarlyNamedGroup, status: 'In Review' })
    const loneTask = await add({
      board_id: loneBoard, group_id: loneCompletedGroup, sub_group_id: loneProject, status: 'Working on it',
    })
    const otherTask = await add({ board_id: otherBoard, group_id: otherCompletedGroup, status: 'Not Started' })
    const legacyActiveDone = await add({ group_id: firstGroup })
    await db.query('insert into public.task_column_values values ($1, $2::jsonb)', [review, '{"remarks":"keep me"}'])

    await db.exec(migration)
    assert.equal((await read(historicalDone)).completed_date, null, 'never guess historical dates')
    assert.equal((await read(legacyActiveDone)).completed_date, null)
    const repairedReview = await read(review)
    assert.equal(repairedReview.group_id, matchingGroup, 'matching project wins over first active group')
    assert.equal(repairedReview.sub_group_id, matchingProject)
    for (const [key, value] of Object.entries(preserved)) assert.deepEqual(repairedReview[key], value, key)
    assert.deepEqual((await db.query('select value from public.task_column_values where task_id = $1', [review])).rows,
      [{ value: { remarks: 'keep me' } }])
    const repairedUnmatched = await read(unmatched)
    assert.equal(repairedUnmatched.group_id, firstGroup)
    assert.notEqual(repairedUnmatched.sub_group_id, otherProject, 'never reuse another board’s project')
    assert.deepEqual((await db.query('select board_id, group_id, name from public.sub_groups where id = $1',
      [repairedUnmatched.sub_group_id])).rows, [{ board_id: board, group_id: firstGroup, name: 'TowGeom' }])
    assert.equal((await read(unprojected)).group_id, firstGroup)
    assert.equal((await read(unprojected)).sub_group_id, null)
    assert.equal((await read(nullStatus)).group_id, firstGroup)
    assert.equal((await read(lookalike)).group_id, similarlyNamedGroup, 'recognize only complete section names')
    assert.equal((await read(otherTask)).group_id, otherActiveGroup)
    const repairedLone = await read(loneTask)
    assert.notEqual(repairedLone.group_id, loneCompletedGroup)
    assert.deepEqual((await db.query('select board_id, name from public.groups where id = $1',
      [repairedLone.group_id])).rows, [{ board_id: loneBoard, name: 'Tasks' }])
    assert.deepEqual((await db.query('select board_id, group_id, name from public.sub_groups where id = $1',
      [repairedLone.sub_group_id])).rows,
    [{ board_id: loneBoard, group_id: repairedLone.group_id, name: 'Lone Project' }])

    const beforeRerun = (await db.query('select to_jsonb(t) as task from public.tasks t order by id')).rows
    const projectCount = (await db.query('select count(*)::int as count from public.sub_groups')).rows[0].count
    await db.exec(migration)
    assert.deepEqual((await db.query('select to_jsonb(t) as task from public.tasks t order by id')).rows, beforeRerun)
    assert.equal((await db.query('select count(*)::int as count from public.sub_groups')).rows[0].count, projectCount)
    assert.equal((await db.query(`select count(*)::int as count from pg_trigger
      where tgrelid = 'public.tasks'::regclass and tgname = 'tasks_enforce_completion'`)).rows[0].count, 1)

    // A non-India session zone must not change the date saved for the app.
    await db.exec("set time zone 'Pacific/Honolulu'; begin")
    const today = (await db.query("select (now() at time zone 'Asia/Kolkata')::date::text as today")).rows[0].today
    assert.equal((await db.query(`select ('2026-09-28 18:30:00+00'::timestamptz
      at time zone 'Asia/Kolkata')::date::text as india_date`)).rows[0].india_date, '2026-09-29')
    const newlyDone = await add()
    assert.equal((await read(newlyDone)).completed_date, today)
    const explicitInsert = await add({ completed_date: '2026-09-01' })
    assert.equal((await read(explicitInsert)).completed_date, '2026-09-01')
    const transition = await update(review, { status: 'Done', group_id: completedGroup, sub_group_id: completedProject })
    assert.equal(transition.completed_date, today)
    assert.equal(transition.due_date, preserved.due_date)
    assert.equal((await update(review, { completed_date: '2026-09-15' })).completed_date, '2026-09-15')
    assert.equal((await update(review, { title: 'Edited after completion' })).completed_date, '2026-09-15')
    assert.equal((await update(review, { completed_date: null })).completed_date, null)
    assert.equal((await update(review, { priority: 'Low' })).completed_date, null, 'clearing date remains an intentional edit')
    assert.equal((await update(historicalDone, { title: 'Legacy task renamed' })).completed_date, null)
    const movedLegacy = await update(legacyActiveDone, { group_id: completedGroup })
    assert.equal(movedLegacy.completed_date, today, 'moving undated Done into completed stamps today')
    const activeDatedDone = await add({ group_id: firstGroup, completed_date: '2026-09-10' })
    assert.equal((await update(activeDatedDone, { group_id: completedGroup, completed_date: null })).completed_date,
      null, 'an explicit date clear on an already dated Done task is retained')

    const reopened = await update(review, { status: 'In Review', completed_date: '2026-09-16' })
    assert.equal(reopened.completed_date, null)
    assert.equal(reopened.group_id, matchingGroup)
    assert.equal(reopened.sub_group_id, matchingProject)
    assert.equal((await update(review, { status: 'Done', completed_date: '2026-09-17' })).completed_date,
      '2026-09-17', 'explicit date can accompany a completion transition')
    assert.equal((await update(review, { status: 'Following Up' })).completed_date, null)
    assert.equal((await update(review, { status: 'Done' })).completed_date, today, 'recompletion starts a new date')
    const attemptedMisfile = await add({ status: 'On Hold', sub_group_id: completedProject, completed_date: '2026-09-10' })
    assert.equal((await read(attemptedMisfile)).group_id, matchingGroup)
    assert.equal((await read(attemptedMisfile)).completed_date, null)
    const movedNonDone = await update(unprojected, { group_id: completedGroup })
    assert.equal(movedNonDone.group_id, firstGroup, 'manual moves cannot file non-Done tasks in completed')
    const sameProjectCount = (await db.query('select count(*)::int as count from public.sub_groups')).rows[0].count
    await add({ status: 'In Review', sub_group_id: unmatchedProject })
    assert.equal((await db.query('select count(*)::int as count from public.sub_groups')).rows[0].count,
      sameProjectCount, 'reuse the mirrored project on later repairs')
    await db.exec('commit')

    // Real role/policy checks confirm the trigger has no elevated access.
    assert.equal((await db.query(`select prosecdef from pg_proc
      where oid = 'public.enforce_task_completion()'::regprocedure`)).rows[0].prosecdef, false)
    await db.exec(`
      create role task_member;
      grant usage on schema public to task_member;
      grant select, insert, update on public.tasks, public.groups, public.sub_groups to task_member;
      alter table public.tasks enable row level security;
      alter table public.groups enable row level security;
      alter table public.sub_groups enable row level security;
      create policy member_tasks on public.tasks to task_member
        using (board_id = '${board}') with check (board_id = '${board}');
      create policy member_projects on public.sub_groups to task_member
        using (board_id = '${board}') with check (board_id = '${board}');
      create policy member_visible_groups on public.groups for select to task_member
        using (id = '${completedGroup}');
      create policy member_group_insert on public.groups for insert to task_member
        with check (false);
      set role task_member;
    `)
    await assert.rejects(db.query("update public.tasks set status = 'In Review' where id = $1", [historicalDone]),
      /row-level security/i, 'hidden active groups must not be found via a privileged trigger')
    assert.equal((await read(historicalDone)).status, 'Done', 'RLS failure rolls back the whole task change')
    assert.equal((await db.query('select id from public.tasks where board_id = $1', [otherBoard])).rows.length, 0)
    await db.exec(`
      reset role;
      drop policy member_visible_groups on public.groups;
      create policy member_visible_groups on public.groups for select to task_member
        using (board_id = '${board}');
      set role task_member;
    `)
    const permittedReopen = await update(historicalDone, { status: 'In Review' })
    assert.equal(permittedReopen.group_id, matchingGroup)
    assert.equal(permittedReopen.sub_group_id, matchingProject)
    assert.equal(permittedReopen.completed_date, null)
    await db.exec('reset role')
  } finally {
    await db.close()
  }
})
