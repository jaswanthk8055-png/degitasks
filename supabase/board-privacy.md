# Private board deployment

`board-privacy.sql` adds `boards.visibility`, keeps all existing boards public,
and adds restrictive row-level security policies for board-related data. A
private board is visible only to its `created_by` user. Private tasks may be
unassigned or assigned only to that user. The creator, workspace and visibility
of a board, and a task's board, cannot be changed through authenticated client
updates. Public boards remain subject to the existing workspace policies.

Production inventory verified on 18 November 2026: `send-daily-reminders` and
`send-invite-email` are the only deployed Edge Functions. The daily cron invokes
`send-daily-reminders`, which handles both email and personal Teams delivery.
Its privacy update has been deployed and verified against the local source,
with gateway JWT verification still enabled. The optional standalone
`teams-reminder` remains source-only, with no deployed function or cron.

## Before deployment

1. Verify the target database has the app's existing schema and permissive RLS
   policies, including `boards`, `groups`, `sub_groups`, `tasks`, `comments`,
   `activity_log`, `notifications`, `board_columns`, and `task_column_values`,
   and the `tasks.assignee_ids` column (`multi-assignee.sql`). The SQL is
   transactional and fails without committing if required tables or columns
   are missing. Existing policies remain necessary to grant access; these
   restrictive policies only remove access.
2. Inspect the live database for additional board or task data tables, views,
   functions, triggers, realtime channels, and service-role consumers. This
   migration covers the listed tables, not unknown objects; database owners,
   bypass-RLS roles, service-role jobs, and security-definer functions can
   bypass RLS and must be reviewed separately. Do not enable private boards
   until all such paths have been verified. In particular, deploy the updated
   active `send-daily-reminders` function before permitting private board
   creation. If another deployment enables the optional standalone
   `teams-reminder`, use its updated private-task filtering too.
3. Take the normal database backup and test the migration and app with two
   workspace accounts in a staging environment. Confirm each can access shared
   boards while neither can read the other's private board, tasks, projects,
   comments, activity, custom columns or notifications, including by direct API.

## Deployment order

1. Run `supabase/board-privacy.sql` in the Supabase SQL editor using a role
   allowed to alter tables and policies. It can be run again safely. Existing
   clients create public boards during this stage.
2. Deploy or verify the updated active `send-daily-reminders` function, preserving
   gateway JWT verification. Its personal Teams cards exclude private tasks,
   and private-task emails are restricted to the assigned board owner. The
   retained standalone `teams-reminder` does not need deployment or scheduling
   for this release; if intentionally enabled later, use its updated source so
   the shared-channel briefing also excludes private tasks.
3. Verify the checks above against the actual deployment, then deploy the app
   that creates boards with a visibility choice. Existing clients use the
   default `public` value and continue to work after the migration.

The repository's isolated PostgreSQL test can be run with
`node supabase/tests/board-privacy.test.mjs`. It does not contact the live
project and cannot validate its additional objects or deployed policies.
