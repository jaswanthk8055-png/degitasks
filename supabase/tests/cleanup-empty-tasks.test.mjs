import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

// This runner never reads .env or connects to Supabase. All rows are synthetic.
const migration = await readFile(new URL('../cleanup-empty-tasks.sql', import.meta.url), 'utf8')
const testMigration = migration.replace(/^create extension if not exists pg_cron;$/m, '')

test('nightly empty-task cleanup: eligibility, deletion, permissions and idempotent scheduling', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.tasks (
        id uuid primary key, board_id uuid, group_id uuid, sub_group_id uuid,
        title text not null, description text, status text, status_color text,
        assignee_id uuid, assignee_ids uuid[], due_date date, priority text,
        position integer, created_by uuid, created_at timestamptz,
        updated_at timestamptz, future_field text,
        parent_task_id uuid references public.tasks(id) on delete cascade
      );
      create table public.comments (
        task_id uuid references public.tasks(id) on delete cascade, body text
      );
      create table public.task_column_values (
        task_id uuid references public.tasks(id) on delete cascade, value jsonb
      );
      create table public.activity_log (
        task_id uuid references public.tasks(id) on delete set null,
        user_id uuid, action text, meta jsonb
      );
      -- PGlite has no background scheduler: exercise real migration registration
      -- against these deliberately small cron API stubs, never an actual job.
      create schema cron;
      create table cron.job (
        jobid bigint generated always as identity primary key,
        jobname text unique, schedule text, command text,
        username text default current_user, active boolean default true
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

    await db.exec(testMigration)
    await db.exec(testMigration)
    assert.deepEqual((await db.query('select jobname, schedule, command, username from cron.job')).rows, [{
      jobname: 'cleanup-empty-tasks',
      schedule: '30 18 * * *',
      command: 'select degitasks_maintenance.cleanup_empty_tasks();',
      username: 'postgres',
    }])

    const [{ midnight }] = (await db.query(`
      select to_char('2026-09-10 18:30:00+00'::timestamptz at time zone 'Asia/Kolkata',
        'YYYY-MM-DD HH24:MI') as midnight
    `)).rows
    assert.equal(midnight, '2026-09-11 00:00')

    for (const role of ['anon', 'authenticated', 'service_role']) {
      const [{ schema_access, function_access }] = (await db.query(`
        select has_schema_privilege($1, 'degitasks_maintenance', 'USAGE') as schema_access,
          has_function_privilege($1,
            'degitasks_maintenance.cleanup_empty_tasks()', 'EXECUTE') as function_access
      `, [role])).rows
      assert.equal(schema_access, false, `${role} must not access maintenance schema`)
      assert.equal(function_access, false, `${role} must not invoke deletion`)
    }

    await db.exec('begin')
    const [{ instant }] = (await db.query('select now()::text as instant')).rows
    const instantMs = new Date(instant).getTime()
    const hoursAgo = hours => new Date(instantMs - hours * 3_600_000).toISOString()
    const creator = '00000000-0000-4000-8000-000000001111'
    const other = '00000000-0000-4000-8000-000000002222'
    const expected = new Set()
    const allNames = new Map()
    let sequence = 0

    async function add(name, overrides = {}, eligible = false) {
      const id = `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
      const row = {
        id, board_id: null, group_id: null, sub_group_id: null, title: '',
        description: null, status: 'Not Started', status_color: '#c4c4c4',
        assignee_id: null, assignee_ids: [], due_date: null, priority: null,
        position: 0, created_by: creator, created_at: hoursAgo(48),
        updated_at: hoursAgo(48), future_field: null, parent_task_id: null, ...overrides,
      }
      await db.query(`
        insert into public.tasks select (jsonb_populate_record(null::public.tasks, $1::jsonb)).*
      `, [JSON.stringify(row)])
      if (eligible) expected.add(id)
      allNames.set(id, name)
      return id
    }

    async function activity(id, action = 'task_created', meta = {}, userId = creator) {
      await db.query('insert into public.activity_log values ($1, $2, $3, $4::jsonb)',
        [id, userId, action, JSON.stringify(meta)])
    }

    await add('old default blank', {}, true)
    await add('whitespace only title', { title: ' \t\n\u00a0\u200b' }, true)
    await add('empty editor markup', { description: '<div><b><br></b>&nbsp;&#160;&#xA0;</div>' }, true)
    await add('old whitespace/reorder edit', { updated_at: hoursAgo(25), position: 4 }, true)
    await add('exactly 24 hours untouched', { updated_at: hoursAgo(24) }, true)
    await add('under 24 hours', { created_at: hoursAgo(23.9), updated_at: hoursAgo(23.9) })
    await add('old row with recent edit', { updated_at: hoursAgo(1) })
    await add('created just before midnight', { created_at: hoursAgo(0.01), updated_at: hoursAgo(0.01) })
    await add('null timestamp', { updated_at: null })
    await add('meaningful title', { title: 'Prepare report' })
    await add('literal markup in title is meaningful', { title: '<br>' })
    await add('plain description', { description: 'Call customer' })
    await add('rich description', { description: '<b>Call customer</b>' })
    await add('image description', { description: '<p><img src="attachment.png"></p>' })
    await add('link description', { description: '<a href="https://example.com"></a>' })
    await add('unknown description markup', { description: '<custom-element></custom-element>' })
    await add('due date', { due_date: '2026-09-15' })
    await add('priority', { priority: 'Low' })
    await add('working status', { status: 'Working on it' })
    await add('custom status color', { status_color: '#aaaaaa' })
    await add('future meaningful field', { future_field: 'retain new features' })
    const parentWithMeaningfulChild = await add('blank parent with meaningful child')
    await add('meaningful child task', {
      parent_task_id: parentWithMeaningfulChild, title: 'Prepare child report',
    })
    const parentWithBlankChild = await add('blank parent with blank child')
    await add('blank child task', { parent_task_id: parentWithBlankChild })
    await add('unrelated blank leaf without children', {}, true)
    await add('manual legacy assignee', { assignee_id: other }, true)
    await add('manual array assignee', { assignee_ids: [other] }, true)
    await add('self assigned without evidence', { assignee_id: creator, assignee_ids: [creator] }, true)

    const defaultAssignment = { assignee_id: creator, assignee_ids: [creator] }
    const auto = await add('proved My Tasks default assignment', defaultAssignment, true)
    await activity(auto, 'task_created', { task_title: '', auto_assigned_user_id: creator })
    const editedAuto = await add('automatic assignment edited later', { ...defaultAssignment, updated_at: hoursAgo(30) }, true)
    await activity(editedAuto, 'task_created', { auto_assigned_user_id: creator })
    const multiple = await add('extra manual assignee', { ...defaultAssignment, assignee_ids: [creator, other] }, true)
    await activity(multiple, 'task_created', { auto_assigned_user_id: creator })
    const wrongActor = await add('mismatched creation actor', defaultAssignment, true)
    await activity(wrongActor, 'task_created', { auto_assigned_user_id: creator }, other)
    const wrongAutoId = await add('mismatched creation assignment', defaultAssignment, true)
    await activity(wrongAutoId, 'task_created', { auto_assigned_user_id: other })
    const assignment = await add('old manual assignment activity', {
      assignee_id: other, assignee_ids: [other], updated_at: hoursAgo(25),
    }, true)
    await activity(assignment, 'task_assigned', { task_title: '', assignee_name: 'Other User' })
    const unassignment = await add('old manual unassignment activity', { updated_at: hoursAgo(25) }, true)
    await activity(unassignment, 'task_assigned', { task_title: '', assignee_name: 'Unassigned' })
    const recentAssignment = await add('recent manual assignment activity', {
      assignee_id: other, assignee_ids: [other], updated_at: hoursAgo(1),
    })
    await activity(recentAssignment, 'task_assigned', { task_title: '', assignee_name: 'Other User' })
    const namedAssignment = await add('assignment remembers meaningful title', defaultAssignment)
    await activity(namedAssignment, 'task_assigned', { task_title: 'Prepare report', assignee_name: 'Creator' })
    const unknownActivity = await add('unknown activity remains protected', defaultAssignment)
    await activity(unknownActivity, 'assignee_changed', { task_title: '' })
    const assignedEdit = await add('assigned task with other activity', defaultAssignment)
    await activity(assignedEdit, 'task_assigned', { task_title: '' })
    await activity(assignedEdit, 'status_changed', { new_status: 'Not Started' })
    await add('assigned task with title', { ...defaultAssignment, title: 'Prepare report' })
    await add('assigned task with description', { ...defaultAssignment, description: 'Call customer' })
    const assignedComment = await add('assigned task with comment', defaultAssignment)
    await activity(assignedComment, 'task_assigned', { task_title: '' })
    await db.query('insert into public.comments values ($1, $2)', [assignedComment, 'Discuss this'])
    const assignedCustomCell = await add('assigned task with custom cell', defaultAssignment)
    await activity(assignedCustomCell, 'task_assigned', { task_title: '' })
    await db.query('insert into public.task_column_values values ($1, $2::jsonb)', [assignedCustomCell, '0'])
    const userActivity = await add('recorded manual edit')
    await activity(userActivity, 'status_changed')
    const createdWithTitle = await add('originally named task')
    await activity(createdWithTitle, 'task_created', { task_title: 'Original title' })
    const ordinaryCreate = await add('ordinary blank creation activity', {}, true)
    await activity(ordinaryCreate, 'task_created', { task_title: '' })
    const comment = await add('comment protects task')
    await db.query('insert into public.comments values ($1, $2)', [comment, 'Discuss this'])
    for (const value of [0, false, 'customer', null, '']) {
      const id = await add(`saved custom cell ${JSON.stringify(value)}`)
      await db.query('insert into public.task_column_values values ($1, $2::jsonb)', [id, JSON.stringify(value)])
    }

    const candidates = (await db.query(`
      select task_id from degitasks_maintenance.empty_task_candidates($1::timestamptz)
    `, [instant])).rows.map(row => row.task_id)
    assert.deepEqual(new Set(candidates), expected,
      `Candidates: ${candidates.map(id => allNames.get(id)).join(', ')}`)
    assert.equal((await db.query('select count(*)::int as count from public.tasks')).rows[0].count,
      allNames.size, 'dry run must not delete any rows')

    const [{ count }] = (await db.query('select degitasks_maintenance.cleanup_empty_tasks()::int as count')).rows
    assert.equal(count, expected.size)
    const remaining = (await db.query('select id from public.tasks')).rows.map(row => row.id)
    assert.deepEqual(new Set(remaining), new Set([...allNames.keys()].filter(id => !expected.has(id))))
    assert.equal((await db.query('select count(*)::int as count from public.comments')).rows[0].count, 2)
    assert.equal((await db.query('select count(*)::int as count from public.task_column_values')).rows[0].count, 6)
    assert.equal((await db.query('select degitasks_maintenance.cleanup_empty_tasks()::int as count')).rows[0].count, 0)
    await db.exec('rollback')
    assert.equal((await db.query('select count(*)::int as count from public.tasks')).rows[0].count, 0)

    // The historical schema lacks parent_task_id. The same migration predicate
    // must still work there without requiring a new task-schema migration.
    await db.exec('alter table public.tasks drop column parent_task_id')
    const legacyLeaf = await add('legacy blank leaf without parent column')
    assert.deepEqual((await db.query(`
      select task_id from degitasks_maintenance.empty_task_candidates()
    `)).rows, [{ task_id: legacyLeaf }])
    assert.equal((await db.query('select degitasks_maintenance.cleanup_empty_tasks()::int as count')).rows[0].count, 1)
  } finally {
    await db.close()
  }
})
