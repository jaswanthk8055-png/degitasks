import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(new URL('../board-privacy.sql', import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('private board data and writes are limited to its creator, including related records', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table boards (id uuid primary key, workspace_id uuid, created_by uuid, name text);
      create table groups (id uuid primary key, board_id uuid);
      create table sub_groups (id uuid primary key, board_id uuid, group_id uuid);
      create table tasks (id uuid primary key, board_id uuid, assignee_id uuid, assignee_ids uuid[], title text, group_id uuid, sub_group_id uuid);
      create table board_columns (id uuid primary key, board_id uuid);
      create table task_column_values (task_id uuid, column_id uuid, value text);
      create table comments (id uuid primary key, task_id uuid, body text);
      create table activity_log (id uuid primary key, board_id uuid, task_id uuid, meta text);
      create table notifications (id uuid primary key, task_id uuid, user_id uuid, message text);
      grant usage on schema public, auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      grant select, insert, update, delete on all tables in schema public to authenticated;
      grant select on all tables in schema public to anon;
      do $$ declare n text; begin
        foreach n in array array['boards','groups','sub_groups','tasks','board_columns','task_column_values','comments','activity_log','notifications'] loop
          execute format('alter table public.%I enable row level security', n);
          execute format('create policy legacy_allow on public.%I for all to authenticated using (true) with check (true)', n);
        end loop;
        create policy legacy_anon on public.boards for select to anon using (true);
        create policy legacy_anon on public.activity_log for select to anon using (true);
      end $$;
    `)
    await db.exec(migration)
    await db.exec(migration) // Migration must be safe to run again.
    const [alice, bob, workspace, shared, privateBoard] = [1, 2, 3, 4, 5].map(id)
    const [sharedTask, privateTask, privateColumn, publicColumn] = [6, 7, 8, 9].map(id)
    await db.query('insert into boards (id,workspace_id,created_by,name,visibility) values ($1,$3,$4,$5,\'public\'),($2,$3,$4,$6,\'private\')', [shared, privateBoard, workspace, alice, 'Shared', 'Personal'])
    await db.query('insert into tasks (id,board_id,assignee_id,assignee_ids,title) values ($1,$3,null,\'{}\',\'Team\'),($2,$4,$5,array[$5]::uuid[],\'Secret\')', [sharedTask, privateTask, shared, privateBoard, alice])
    await db.query('insert into board_columns values ($1,$3),($2,$4)', [publicColumn, privateColumn, shared, privateBoard])
    await db.query('insert into groups values ($1,$2)', [id(10), privateBoard])
    await db.query('insert into sub_groups (id,board_id) values ($1,$2)', [id(11), privateBoard])
    await db.query('insert into task_column_values values ($1,$2,\'secret\')', [privateTask, privateColumn])
    await db.query('insert into comments values ($1,$2,\'secret\')', [id(12), privateTask])
    await db.query('insert into activity_log values ($1,$2,$3,\'secret\')', [id(13), privateBoard, privateTask])
    await db.query('insert into notifications values ($1,$2,$3,\'secret\')', [id(14), privateTask, alice])
    await db.exec('set role anon')
    assert.equal((await db.query('select * from boards')).rows.length, 0)
    assert.equal((await db.query('select * from activity_log')).rows.length, 0)
    await db.exec('reset role; set role authenticated')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [bob])
    for (const table of ['groups', 'sub_groups', 'task_column_values', 'comments', 'activity_log', 'notifications']) {
      assert.equal((await db.query(`select * from ${table}`)).rows.length, 0, table)
    }
    assert.deepEqual((await db.query('select name from boards')).rows.map(row => row.name), ['Shared'])
    assert.deepEqual((await db.query('select title from tasks')).rows.map(row => row.title), ['Team'])
    assert.equal((await db.query('update tasks set title = $1 where id = $2 returning id', ['Stolen', privateTask])).rows.length, 0)
    await assert.rejects(db.query('insert into boards values ($1,$2,$3,$4,$5)', [id(15), workspace, alice, 'Forged', 'private']))
    await assert.rejects(db.query('update boards set created_by = $1, visibility = $2 where id = $3', [bob, 'private', shared]))
    await assert.rejects(db.query('insert into task_column_values values ($1,$2,$3)', [sharedTask, privateColumn, 'leak']))
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [alice])
    assert.equal((await db.query('select * from boards')).rows.length, 2)
    assert.equal((await db.query('select * from comments')).rows.length, 1)
    await assert.rejects(db.query('update tasks set board_id = $1 where id = $2', [shared, privateTask]))
    await assert.rejects(db.query('update tasks set group_id = $1 where id = $2', [id(10), sharedTask]))
    await assert.rejects(db.query('update tasks set assignee_id = $1 where id = $2', [bob, privateTask]))
    await assert.rejects(db.query('update tasks set assignee_ids = array[$1]::uuid[] where id = $2', [bob, privateTask]))
    await assert.rejects(db.query('insert into notifications values ($1,$2,$3,$4)', [id(16), privateTask, bob, 'Secret']))
    await assert.rejects(db.query('insert into activity_log values ($1,$2,$3,$4)', [id(17), shared, privateTask, 'Secret']))
    await assert.rejects(db.query('insert into task_column_values values ($1,$2,$3)', [sharedTask, privateColumn, 'leak']))
  } finally {
    await db.close()
  }
})
