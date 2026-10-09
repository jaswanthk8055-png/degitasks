import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

// Disposable synthetic PostgreSQL only. Never reads .env or contacts Supabase.
const taskMigration = (await readFile(new URL('../cleanup-empty-tasks.sql', import.meta.url), 'utf8'))
  .replace(/^create extension if not exists pg_cron;$/m, '')
const projectMigration = (await readFile(new URL('../cleanup-empty-projects.sql', import.meta.url), 'utf8'))
  .replace(/^create extension if not exists pg_cron;$/m, '')
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const board = uuid(1)
const otherBoard = uuid(2)
const group = uuid(11)
const completedGroup = uuid(12)
const legacyProject = uuid(21)

async function initialize(db) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.boards (id uuid primary key);
    create table public.groups (
      id uuid primary key, board_id uuid references public.boards, name text not null
    );
    -- Historical projects have no timestamp columns.
    create table public.sub_groups (
      id uuid primary key, board_id uuid references public.boards,
      group_id uuid references public.groups, name text not null
    );
    create table public.tasks (
      id uuid primary key, board_id uuid references public.boards,
      group_id uuid references public.groups,
      sub_group_id uuid references public.sub_groups(id) on delete cascade,
      title text not null default '', description text, status text default 'Not Started',
      status_color text default '#c4c4c4', assignee_id uuid, assignee_ids uuid[],
      due_date date, priority text, position integer default 0, created_by uuid,
      created_at timestamptz default now(), updated_at timestamptz default now(),
      parent_task_id uuid references public.tasks(id) on delete cascade
    );
    create table public.comments (
      task_id uuid references public.tasks(id) on delete cascade, body text
    );
    create table public.task_column_values (
      task_id uuid references public.tasks(id) on delete cascade, value jsonb
    );
    create table public.activity_log (
      task_id uuid references public.tasks(id) on delete set null, action text, meta jsonb
    );
    -- No background worker: test only real SQL registration against cron stubs.
    create schema cron;
    create table cron.job (
      jobid bigint generated always as identity primary key, jobname text unique,
      schedule text, command text, username text default current_user,
      active boolean default true
    );
    create function cron.schedule(job_name text, expression text, sql_command text)
    returns bigint language sql as $$
      insert into cron.job(jobname, schedule, command)
      values(job_name, expression, sql_command) returning jobid;
    $$;
    create function cron.unschedule(job_name text)
    returns boolean language sql as $$
      with removed as (delete from cron.job where jobname = job_name returning jobid)
      select exists(select 1 from removed);
    $$;
  `)
  await db.query('insert into public.boards values ($1), ($2)', [board, otherBoard])
  await db.query('insert into public.groups values ($1, $2, $3), ($4, $2, $5)',
    [group, board, 'Active Tasks', completedGroup, 'Completed Tasks'])
  await db.query('insert into public.sub_groups values ($1, $2, $3, $4)',
    [legacyProject, board, group, 'Legacy empty project'])
}

test('nightly project cleanup: grace periods, all references, ordered deletion and permissions', async () => {
  const db = new PGlite()
  try {
    await initialize(db)
    await db.exec(taskMigration)
    await db.exec(projectMigration)
    await db.exec(projectMigration)

    assert.deepEqual((await db.query('select jobname, schedule, command, username from cron.job')).rows, [{
      jobname: 'cleanup-empty-tasks', schedule: '30 18 * * *',
      command: 'select * from degitasks_maintenance.cleanup_empty_tasks_and_projects();',
      username: 'postgres',
    }])
    assert.deepEqual((await db.query('select id, created_at from public.sub_groups')).rows,
      [{ id: legacyProject, created_at: null }], 'install/rerun must not delete or backfill legacy projects')
    const [{ midnight }] = (await db.query(`
      select to_char('2026-10-08 18:30:00+00'::timestamptz at time zone 'Asia/Kolkata',
        'YYYY-MM-DD HH24:MI') as midnight
    `)).rows
    assert.equal(midnight, '2026-10-09 00:00')

    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await db.query(`
        select has_schema_privilege($1, 'degitasks_maintenance', 'USAGE') as allowed
      `, [role])).rows[0].allowed, false)
      for (const signature of [
        'is_empty_project(public.sub_groups,timestamp with time zone)',
        'empty_project_candidates(timestamp with time zone)',
        'cleanup_empty_projects()', 'cleanup_empty_tasks_and_projects()',
      ]) {
        assert.equal((await db.query(`
          select has_function_privilege($1, $2, 'EXECUTE') as allowed
        `, [role, `degitasks_maintenance.${signature}`])).rows[0].allowed, false,
        `${role} must not execute ${signature}`)
      }
    }
    assert.equal((await db.query(`
      select count(*)::int as elevated from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'degitasks_maintenance' and p.prosecdef
    `)).rows[0].elevated, 0, 'maintenance must use caller permissions')
    const [{ definition }] = (await db.query(`
      select pg_get_functiondef('degitasks_maintenance.cleanup_empty_projects()'::regprocedure) as definition
    `)).rows
    assert.match(definition, /for update of sg skip locked/i)
    assert.equal((definition.match(/is_empty_project\(sg, cutoff\)/g) || []).length, 2,
      'eligibility must be rechecked after acquiring the project lock')

    await db.exec('begin')
    const [{ instant }] = (await db.query('select now()::text as instant')).rows
    const instantMs = new Date(instant).getTime()
    const hoursAgo = hours => new Date(instantMs - hours * 3_600_000).toISOString()
    const expected = new Set([legacyProject])
    const names = new Map([[legacyProject, 'Legacy empty project']])
    let sequence = 100
    async function addProject(name, createdAt = hoursAgo(48), overrides = {}, eligible = false) {
      const id = uuid(++sequence)
      await db.query(`
        insert into public.sub_groups (id, board_id, group_id, name, created_at)
        values ($1, $2, $3, $4, $5::timestamptz)
      `, [id, overrides.board_id ?? board, overrides.group_id ?? group, name, createdAt])
      if (eligible) expected.add(id)
      names.set(id, name)
      return id
    }
    async function addTask(projectId, overrides = {}) {
      const id = uuid(++sequence)
      const row = {
        id, board_id: board, group_id: group, sub_group_id: projectId,
        title: 'Keep this task', status: 'Not Started', status_color: '#c4c4c4',
        created_at: hoursAgo(48), updated_at: hoursAgo(48), ...overrides,
      }
      await db.query(`
        insert into public.tasks select (jsonb_populate_record(null::public.tasks, $1::jsonb)).*
      `, [JSON.stringify(row)])
      return id
    }

    await addProject('Named old empty project', hoursAgo(48), {}, true)
    await addProject('Empty completed project', hoursAgo(48), { group_id: completedGroup }, true)
    await addProject('Exactly 24 hours old', hoursAgo(24), {}, true)
    await addProject('Under 24 hours', hoursAgo(23.9))
    await addProject('Created immediately before midnight', hoursAgo(0.01))
    await addProject('Future timestamp', hoursAgo(-1))
    const fresh = uuid(++sequence)
    await db.query('insert into public.sub_groups (id, board_id, group_id, name) values ($1, $2, $3, $4)',
      [fresh, board, group, 'Timestamp supplied by default'])
    assert.equal(new Date((await db.query('select created_at from public.sub_groups where id = $1',
      [fresh])).rows[0].created_at).getTime(), instantMs)

    const protectedProjects = []
    for (const status of ['Not Started', 'Working on it', 'Done', null]) {
      const id = await addProject(`Task status ${status}`, hoursAgo(48),
        status === 'Done' ? { group_id: completedGroup } : {})
      protectedProjects.push(id)
      await addTask(id, { status })
    }
    const freshBlank = await addProject('Fresh blank task protects project')
    await addTask(freshBlank, { title: '', created_at: hoursAgo(1), updated_at: hoursAgo(1) })
    protectedProjects.push(freshBlank)
    const parentOutside = await addTask(null)
    const childOnly = await addProject('Only a child task references this project')
    const child = await addTask(childOnly, { title: '', parent_task_id: parentOutside })
    protectedProjects.push(childOnly)
    const mismatchedBoard = await addProject('Cross-board reference still protects project')
    await addTask(mismatchedBoard, { board_id: otherBoard })
    protectedProjects.push(mismatchedBoard)
    const blankParentProject = await addProject('Blank parent and child retained')
    const parent = await addTask(blankParentProject, { title: '' })
    await addTask(blankParentProject, { title: '', parent_task_id: parent })
    protectedProjects.push(blankParentProject)
    const customCellProject = await addProject('Saved custom task cell protects project')
    const customTask = await addTask(customCellProject, { title: '' })
    await db.query('insert into public.task_column_values values ($1, $2::jsonb)', [customTask, 'false'])
    protectedProjects.push(customCellProject)
    const emptiedByTaskCleanup = await addProject('Old blank task removed before project')
    const emptyTask = await addTask(emptiedByTaskCleanup, { title: '' })

    // Respect updated_at where an existing project schema already has it.
    await db.exec('alter table public.sub_groups add column updated_at timestamptz')
    const recentlyEdited = await addProject('Old project edited recently')
    await db.query('update public.sub_groups set updated_at = $1 where id = $2', [hoursAgo(1), recentlyEdited])
    const unknownCreationRecentEdit = await addProject('Legacy project edited recently', null)
    await db.query('update public.sub_groups set updated_at = $1 where id = $2', [hoursAgo(1), unknownCreationRecentEdit])
    const oldEdit = await addProject('Exactly 24 hours since last edit', hoursAgo(48), {}, true)
    await db.query('update public.sub_groups set updated_at = $1 where id = $2', [hoursAgo(24), oldEdit])

    const before = (await db.query('select count(*)::int as count from public.sub_groups')).rows[0].count
    const candidates = (await db.query(`
      select project_id from degitasks_maintenance.empty_project_candidates($1::timestamptz)
    `, [instant])).rows.map(row => row.project_id)
    assert.deepEqual(new Set(candidates), expected,
      `Candidates: ${candidates.map(id => names.get(id)).join(', ')}`)
    assert.equal((await db.query('select count(*)::int as count from public.sub_groups')).rows[0].count,
      before, 'dry run must never delete projects')

    assert.deepEqual((await db.query(`
      select deleted_tasks::int, deleted_projects::int
      from degitasks_maintenance.cleanup_empty_tasks_and_projects()
    `)).rows, [{ deleted_tasks: 1, deleted_projects: expected.size + 1 }])
    const remaining = new Set((await db.query('select id from public.sub_groups')).rows.map(row => row.id))
    for (const id of [...expected, emptiedByTaskCleanup]) assert.equal(remaining.has(id), false)
    for (const id of protectedProjects) assert.equal(remaining.has(id), true)
    assert.equal((await db.query('select count(*)::int as count from public.tasks where id = $1',
      [emptyTask])).rows[0].count, 0)
    assert.equal((await db.query('select count(*)::int as count from public.tasks where id = $1',
      [child])).rows[0].count, 1, 'child tasks must not be cascaded away')
    assert.equal((await db.query('select count(*)::int as count from public.boards')).rows[0].count, 2)
    assert.equal((await db.query('select count(*)::int as count from public.groups')).rows[0].count, 2)
    assert.deepEqual((await db.query(`
      select deleted_tasks::int, deleted_projects::int
      from degitasks_maintenance.cleanup_empty_tasks_and_projects()
    `)).rows, [{ deleted_tasks: 0, deleted_projects: 0 }])
    await db.exec('rollback')
  } finally {
    await db.close()
  }
})

test('project cleanup rechecks a stale candidate and keeps a newly referenced project', async () => {
  const db = new PGlite()
  try {
    await initialize(db)
    await db.exec(taskMigration)
    await db.exec(projectMigration)
    // PGlite has one serialized connection. Inject a task after the original
    // eligibility result but before candidate deletion to exercise the actual
    // second predicate, including an ON DELETE CASCADE FK.
    await db.exec(`
      alter function degitasks_maintenance.is_empty_project(public.sub_groups, timestamptz)
        rename to original_is_empty_project;
      create function degitasks_maintenance.is_empty_project(project public.sub_groups, as_of timestamptz)
      returns boolean language plpgsql volatile as $$
      declare eligible boolean;
      begin
        eligible := degitasks_maintenance.original_is_empty_project(project, as_of);
        if eligible and project.id = '${legacyProject}'::uuid then
          insert into public.tasks (id, board_id, group_id, sub_group_id, title)
          values ('${uuid(301)}'::uuid, project.board_id, project.group_id, project.id, 'Saved while cleanup selected');
        end if;
        return eligible;
      end;
      $$;
    `)
    assert.equal((await db.query('select degitasks_maintenance.cleanup_empty_projects()::int as count'))
      .rows[0].count, 0)
    assert.equal((await db.query('select count(*)::int as count from public.sub_groups')).rows[0].count, 1)
    assert.equal((await db.query('select count(*)::int as count from public.tasks')).rows[0].count, 1,
      'task introduced after candidate selection must never be cascaded away')
  } finally {
    await db.close()
  }
})

test('combined cleanup rolls task deletion back when project deletion fails', async () => {
  const db = new PGlite()
  try {
    await initialize(db)
    await db.exec(taskMigration)
    await db.exec(projectMigration)
    const task = uuid(201)
    await db.query(`
      insert into public.tasks (id, board_id, group_id, sub_group_id, created_at, updated_at)
      values ($1, $2, $3, $4, now() - interval '48 hours', now() - interval '48 hours')
    `, [task, board, group, legacyProject])
    await db.exec(`
      create function public.reject_project_delete() returns trigger language plpgsql as $$
      begin raise exception 'Synthetic project delete failure'; end;
      $$;
      create trigger reject_project_delete before delete on public.sub_groups
      for each row execute function public.reject_project_delete();
    `)
    await assert.rejects(db.query('select * from degitasks_maintenance.cleanup_empty_tasks_and_projects()'),
      /Synthetic project delete failure/)
    assert.equal((await db.query('select count(*)::int as count from public.tasks where id = $1',
      [task])).rows[0].count, 1, 'one failed wrapper call must not commit partial task cleanup')
    assert.equal((await db.query('select count(*)::int as count from public.sub_groups')).rows[0].count, 1)
  } finally {
    await db.close()
  }
})

test('installation rejects missing task cleanup, unsafe project FK and incorrect cron timezone', async () => {
  const db = new PGlite()
  try {
    await initialize(db)
    await assert.rejects(db.exec(projectMigration), /Install cleanup-empty-tasks.sql/)
    await db.exec('rollback')
    await db.exec(taskMigration)
    await db.exec('alter table public.tasks drop constraint tasks_sub_group_id_fkey')
    await assert.rejects(db.exec(projectMigration), /requires a validated tasks.sub_group_id foreign key/)
    await db.exec('rollback')
    await db.exec(`
      alter table public.tasks add constraint tasks_sub_group_id_fkey
        foreign key (sub_group_id) references public.sub_groups(id) on delete cascade;
      set cron.timezone = 'Asia/Kolkata';
    `)
    await assert.rejects(db.exec(projectMigration), /Expected pg_cron timezone UTC\/GMT/)
    await db.exec('rollback')
    assert.deepEqual((await db.query('select command from cron.job')).rows,
      [{ command: 'select degitasks_maintenance.cleanup_empty_tasks();' }],
    'failed install must preserve the old scheduled command')
    assert.equal((await db.query('select count(*)::int as count from public.sub_groups')).rows[0].count, 1)
  } finally {
    await db.close()
  }
})
