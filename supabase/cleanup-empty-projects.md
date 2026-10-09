# Empty project cleanup

`cleanup-empty-projects.sql` extends the existing midnight maintenance job to
remove projects with **no task references**. The job runs every day at **00:00
Asia/Kolkata (18:30 UTC)**, even when the site is closed. It first applies the
existing empty-task rules, then removes projects that are empty after that
cleanup. This is one ordered database transaction and one scheduled job.

A task referencing a project protects it regardless of status, title,
assignment, board, or whether it is a child task. Completed projects with tasks
are retained. Project names do not affect eligibility. Boards and task groups
are retained.

New projects receive the same **24-hour grace period** as empty tasks. The
migration adds a nullable `sub_groups.created_at` column if needed, then sets
its default to `now()` for future inserts. It does not backfill existing rows
whose original creation times are unknown: those projects qualify at the first
midnight if empty. Existing creation timestamps are retained. If the project
schema already has an `updated_at` column, a recent edit also restarts the
24-hour grace period. No `updated_at` column or frontend timestamp writes are
introduced by this migration.

## Install and inspect

1. Install the existing project schema and
   [`cleanup-empty-tasks.sql`](cleanup-empty-tasks.sql), then run
   [`cleanup-empty-projects.sql`](cleanup-empty-projects.sql) in the Supabase SQL
   Editor as `postgres`. The project migration is safe to rerun and **does not
   immediately delete anything**. The first scheduled cleanup can happen at the
   next midnight.
2. Inspect eligible projects with this **read-only dry run**:

   ```sql
   select *
   from degitasks_maintenance.empty_project_candidates()
   order by board_id, group_id, name;
   ```

   These are projects currently empty and past their grace period. Projects
   whose last remaining tasks qualify for empty-task cleanup can also disappear
   during the nightly combined run. Inspect those tasks separately with:

   ```sql
   select * from degitasks_maintenance.empty_task_candidates();
   ```

For inspection before changing the existing job, run the project migration
through its function permission statements, omit the final scheduling
`DO`/`SELECT` blocks, and commit. Inspect both dry runs, then run the complete
migration to install the combined command. Always apply the project migration
last: rerunning the older task-only migration restores the task-only job until
the project migration is rerun.

Installation requires a validated `tasks.sub_group_id` foreign key to
`sub_groups.id`, the existing task cleanup function, and a UTC/GMT pg_cron
configuration. A missing prerequisite raises an error and rolls back the
migration, preserving the previous schedule.

Functions use caller permissions (`SECURITY INVOKER`) in the private
`degitasks_maintenance` schema. Browser/API roles cannot invoke them. The job
runs as `postgres`. Projects being saved are skipped with `FOR UPDATE SKIP
LOCKED`; the task foreign key prevents new references from racing past that
lock. Eligibility is checked again before deletion. These checks protect tasks
even if the live foreign key uses `ON DELETE CASCADE`.

## Monitor or pause

The existing job name remains `cleanup-empty-tasks`, with a combined command:

```sql
select jobid, jobname, schedule, command, username, active
from cron.job where jobname = 'cleanup-empty-tasks';

select r.status, r.start_time, r.end_time, r.return_message
from cron.job_run_details r
join cron.job j using (jobid)
where j.jobname = 'cleanup-empty-tasks'
order by r.start_time desc limit 10;
```

Pause both cleanup steps without removing their functions:

```sql
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'cleanup-empty-tasks';
```

Restore task-only maintenance without removing project timestamps/functions:

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'cleanup-empty-tasks'),
  command := 'select degitasks_maintenance.cleanup_empty_tasks();'
);
```

Each cleanup function logs its deletion count. The combined function returns
`deleted_tasks` and `deleted_projects`; calling it directly deletes eligible
rows, so use the candidate queries for inspection. Removed rows reach open
clients through existing realtime events or a board refresh.

## Local regression checks

Run `npm run test:cleanup` after `npm ci`. The project test uses disposable
in-memory PGlite databases and synthetic rows; it reads no secrets and makes no
Supabase calls. It exercises the actual migration, dry runs, 24-hour cutoff,
legacy timestamps, optional last-edit timestamps, completed and child tasks,
ordered task/project deletion, rollback on failure, API-role permissions and
idempotent schedule registration. An injected stale candidate verifies that
the deletion recheck retains a newly referenced project with a cascade FK.

PGlite has one serialized connection and no background cron worker. These
tests verify the lock SQL and candidate recheck, but cannot simulate two hosted
sessions or prove cron fires. Check the schedule and execution queries after
installation.

References: [Supabase Cron](https://supabase.com/docs/guides/cron),
[PostgreSQL row locking](https://www.postgresql.org/docs/current/explicit-locking.html).
