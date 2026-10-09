# Empty task cleanup

`cleanup-empty-tasks.sql` installs a database job that runs at **midnight in
Asia/Kolkata (18:30 UTC)** every day, including when nobody has the site open.
It waits until a task has been untouched for **at least 24 hours**. A task
created at 11:59 PM therefore survives the immediately following midnight.

Only empty task rows qualify. A name, description, due date, non-default status
or priority, comment, saved custom cell, or recorded activity other than blank
task creation/assignment protects the task. Empty rich text such as
`<div><br></div>` is treated as blank; images, links
and unknown markup are preserved. Saved checkbox `false`, numeric `0`, and even
deliberately cleared custom cells count as intentional interaction. Projects,
groups and boards are not cleaned up by this base migration. To extend the same
midnight job to remove projects that have no task references, install
[`cleanup-empty-projects.sql`](cleanup-empty-projects.sql) afterward and follow
the [project cleanup guide](cleanup-empty-projects.md). Do not rerun this base
migration afterward, since it restores the task-only schedule.

A task with any child task is also retained, even when both rows are empty, so
deleting an empty parent cannot cascade into its children. Child tasks with a
parent are conservatively retained as well. This check also supports older
schemas without the `parent_task_id` column.

Assignment alone does not protect an empty task. Unassigned, manually assigned,
automatically assigned, and multiple-assignee tasks follow the same checks.
Assigning or reassigning a task updates its last-edit timestamp and restarts the
24-hour grace period. Blank `task_created` and `task_assigned` activity records
are allowed; all other activity, or a nonblank task title recorded in either
event, protects the row. Automatic-assignment metadata is not required. If new
task columns are introduced later, their non-null data automatically protects
a row until the cleanup rule is reviewed.

## Install and inspect

1. Run `cleanup-empty-tasks.sql` in the Supabase SQL Editor as `postgres`, after
   the existing schema, phases 2/3 and multi-assignee migrations. The script is
   safe to rerun: it replaces the one named job. It does not immediately delete
   tasks. The first deletion can occur at the next midnight once installed.
2. Inspect the current eligible rows with this **read-only dry run**:

   ```sql
   select c.*, t.title, t.assignee_ids
   from degitasks_maintenance.empty_task_candidates() c
   join public.tasks t on t.id = c.task_id
   order by c.created_at;
   ```

For a review before activating the job, run the migration through its function
permission statements, omit the final scheduling `DO`/`SELECT` blocks, and
commit. Inspect the dry run; then run the complete migration to install the
schedule. Changing your database's session time zone is unnecessary. The script
rejects a non-UTC/GMT pg_cron configuration instead of silently using the wrong
midnight.

Functions live in the private `degitasks_maintenance` schema, use caller
permissions, and are unavailable to browser/API roles. The scheduled job runs
as `postgres`. No application secret, HTTP call or additional Edge Function is
needed. Cleanup locks each candidate and rechecks it before deleting; tasks
currently being saved are skipped. Cleaned rows are removed from open clients
when deletion events arrive or the board data is refreshed.

Check the schedule and execution results:

```sql
select jobid, jobname, schedule, username, active
from cron.job where jobname = 'cleanup-empty-tasks';

select r.status, r.start_time, r.end_time, r.return_message
from cron.job_run_details r
join cron.job j using (jobid)
where j.jobname = 'cleanup-empty-tasks'
order by r.start_time desc limit 10;
```

Pause cleanup without removing its functions:

```sql
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'cleanup-empty-tasks';
```

The function logs the deletion count in the Postgres logs. Scheduled deletion is
permanent; the dry-run query never invokes it.

## Local regression checks

Run `node supabase/tests/cleanup-empty-tasks.test.mjs` after `npm ci`. The test
uses a disposable in-memory PGlite PostgreSQL instance with synthetic data and
rolls its fixtures back. It executes the actual migration functions and delete
logic, plus an idempotent cron registration stub; no live Supabase connection is
read or used. The stub checks the schedule but cannot prove a hosted cron job
will fire. Hosted scheduling is verified with the SQL queries above after rollout.

References: [Supabase Cron](https://supabase.com/docs/guides/cron),
[pg_cron scheduling and time zones](https://github.com/citusdata/pg_cron).
