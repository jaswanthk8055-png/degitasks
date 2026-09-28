# DegiTasks

A collaborative task management web app inspired by Monday.com's UI/UX.

Built with React 19 + Vite 8, Tailwind CSS v3, Supabase, Zustand, and @dnd-kit.

---

## Prerequisites

- Node.js 24 is recommended (`.nvmrc` records this version); Node.js 22.13+ is also supported.
- Access to the existing Supabase project and its frontend configuration.

---

## Continue development on a new PC

The frontend connects to the existing hosted Supabase project. Moving the source code to another PC does not require creating a database, rerunning SQL, redeploying functions, or registering another Teams app.

### 1. Install dependencies

Run these commands inside the `taskflow` folder, which contains `package.json`:

```powershell
npm ci
```

Use `npm ci` to reinstall the exact versions in `package-lock.json`. Do not reuse a copied `node_modules` folder: copying/syncing it can omit nested dependency files (including files inside the Teams SDK). Do not delete or regenerate the lockfile to repair this.

On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd` for the same commands.

### 2. Keep the existing environment configuration

If `.env` was copied with the project, keep it. It contains the existing project's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Otherwise, create `.env` from `.env.example` and obtain the existing project values from its owner or Supabase dashboard.

Never place a Supabase service-role key or email API secret in a `VITE_` variable: these values are included in the browser bundle.

### 3. Start the dev server

```bash
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`) and sign in with your existing account. Changes made after signing in use the configured Supabase database, including the team's real data when production credentials are configured.

`npm run dev` serves the frontend only. Invitations still use the deployed Supabase function, but assignment emails use Vercel's `/api/send-email` endpoint, which Vite does not run. To test that endpoint locally, use `npx vercel dev` with the existing Vercel project and server-side environment variables; do not add server secrets to the frontend. `npm run preview` also serves only the frontend.

For password-reset links in local development, the exact local `/reset-password` URL must be allowed in the existing project's Supabase Auth redirect settings. Normal email/password sign-in does not require a localhost redirect change.

### 4. Check changes before release

```powershell
npm run check
```

This runs ESLint, the regression tests, and creates the production frontend in `dist/`. Tests use isolated mock transport and an in-memory PostgreSQL database; they do not access the team's Supabase project. The command does not deploy or modify the live database. Verify affected authenticated flows and email delivery before deploying.

Run `npm test` for regression checks only. The dropdown visual fixture is available at `/tests/dropdown-demo.html` while the Vite dev server is running; it contains no team data and is not included in the production build.

## My Tasks creation and empty-task cleanup

Tasks created using **New Task**, **Add task**, or **Add task to this project** in My Tasks are assigned to the current user in the initial insert. Their row appears immediately and is ready to name. My Tasks shows projects containing tasks assigned to you. A new empty project you create stays visible in the current session while you add its first task. **Add Project** remains available in active groups, including groups with no tasks assigned to you. Main Table creation continues to leave the assignee blank.

Groups named **Completed Tasks** or **Completed** have no task/project creation controls in either view. The header's **New Task** uses the first active group, creating a **Tasks** group if none exists.

Use the **Move to project** arrow beside a task's name, or the **Project** field in Task Details, to move it into any project on the current board. This also works for tasks created without a project and includes empty projects hidden by My Tasks. Select **No project** to remove a task from its project while keeping it in its current group. Moving preserves the task's details, assignees, status, and updates; projects in another group move the task into that group as well.

Status, priority and assignee dropdowns open above their trigger when space below is insufficient. Long lists scroll inside the menu so all choices remain reachable.

The nightly cleanup requires one separate Supabase migration: `supabase/cleanup-empty-tasks.sql`. It installs a daily midnight India-time job, with a 24-hour untouched grace period, and keeps tasks containing entered information. Projects/groups, tasks with children, and child tasks with a parent are retained. Assignment alone does not protect an empty task: manual, automatic, multiple-assignee and unassigned tasks follow the same checks. Assignment changes restart the 24-hour grace period; other recorded activity still protects the task. See [the cleanup installation and dry-run guide](supabase/cleanup-empty-tasks.md) for full rules and rollout steps. The frontend build/deployment alone does not activate this database job. Apply only this new migration to the existing database; do not replay historical schema scripts.

## Completed Tasks and My Tasks filters

Apply **only** [`supabase/completed-tasks.sql`](supabase/completed-tasks.sql) in the existing Supabase SQL Editor **before deploying this frontend**. This additive, rerunnable migration adds `tasks.completed_date`, installs the completion safeguards, and moves existing unfinished tasks out of Completed Tasks. It requires the existing `sub_groups` table used by this app; do not replay the historical schema files. The local implementation and tests do not apply this migration to the hosted database.

Marking a task **Done** records today's date in India time and moves it into the board's Completed Tasks section when one exists, preserving the project by name. The editable **Completed Date** column appears in completed sections (including the Done status grouping). Reopening a task clears that date and returns it to an active group, preferring a matching project. If no active group exists, a Tasks group is created. Status changes from Task Details, table rows, and the summary use the same save path. Unfinished tasks cannot be moved into a completed project. Existing Done tasks keep an empty completion date until edited; historical dates are not guessed from the last update time.

My Tasks supports **Filter** and **Group by**, with selections retained separately from Main Table. It always remains restricted to your assigned tasks, including shared assignments. Assignee filters are hidden in My Tasks. All filter menus include **Following Up** and **On Hold** and omit **Done**; Done remains available when editing task status. The completion migration is covered by `npm run test:completion`, included in `npm run check`.

## Setting up a separate database

The SQL files under `supabase/` are historical scripts, not a complete ordered migration set. They do not define all objects used by the current app (including `sub_groups`, `boards.status_options`, and `boards.automations`). Obtain a complete schema export and configuration from the existing project before creating a separate development database. Do not replay these scripts into the working production database as part of PC setup.

---

## First run with a new account

Existing team members should sign in instead. Signup creates records in the configured database.

1. Navigate to `/signup` and create an account.
2. DegiTasks automatically creates a default workspace, a **"My First Board"** board with two groups ("To Do" and "In Progress") and three placeholder tasks.
3. You are redirected to the board immediately after signup.

---

## Features

| Feature | Status |
|---|---|
| Email/password auth | ✅ |
| Auto workspace + board on signup | ✅ |
| Dark sidebar (Monday.com style) | ✅ |
| Board table view | ✅ |
| Inline task title editing | ✅ |
| Status pill with color-coded dropdown | ✅ |
| Priority pill with color-coded dropdown | ✅ |
| Assignee picker with avatar | ✅ |
| Due date picker | ✅ |
| Task groups (collapsible, colored) | ✅ |
| Drag-and-drop task reordering | ✅ |
| Real-time collaboration (Supabase) | ✅ |
| Live indicator in top bar | ✅ |
| Create/rename boards | ✅ |
| Create/rename groups | ✅ |
| Add/delete tasks | ✅ |
| Kanban / summary view | ✅ |
| Calendar view | ✅ |

---

## Project structure

```
src/
├── components/
│   ├── auth/        LoginForm, SignupForm
│   ├── board/       BoardTable, TaskGroup, TaskRow, StatusPill, PriorityPill,
│   │                AssigneePicker, DatePicker
│   ├── layout/      AppLayout, Sidebar, TopBar
│   └── ui/          Avatar, Button, Dropdown, Modal
├── hooks/           useBoard, useTasks, useRealtime
├── lib/             supabase.js, utils.js
├── pages/           LoginPage, SignupPage, BoardPage, HomePage, NotFoundPage
└── stores/          useAuthStore, useBoardStore
supabase/
└── *.sql            Historical schema and incremental changes (see database setup note)
```

---

## Tech stack

- **React 19** + **Vite 8** — frontend framework & build tool
- **Tailwind CSS v3** — utility-first styling
- **Supabase** — auth, PostgreSQL database, realtime subscriptions
- **React Router v7** — client-side routing
- **Zustand** — lightweight client state management
- **@dnd-kit** — accessible drag-and-drop
- **date-fns** — date formatting utilities

---

## Architecture & external services

DegiTasks is a static frontend (Vercel) backed by Supabase, with a few integrations layered on top:

| Service | Role | Where it's configured |
|---|---|---|
| **Supabase** | Auth, Postgres DB, Row Level Security, Realtime subscriptions, and 3 Edge Functions | Project dashboard → Settings → API. Schema lives in `supabase/schema.sql` (plus incremental migrations: `phase2.sql`, `phase3.sql`, `phase4.sql`, `multi-assignee.sql`, `add_*.sql`, `fix_rls_recursion.sql`) |
| **Vercel** | Hosting/deployment, serverless function (`api/send-email.js`), Teams-specific CSP headers | `vercel.json`; env vars set in the Vercel project dashboard |
| **Resend** | Transactional email (workspace invites, daily task reminders) | `RESEND_API_KEY` env var, used by `api/send-email.js` and the `send-invite-email` / `send-daily-reminders` Edge Functions |
| **Microsoft Teams / Azure AD** | Teams tab app, auth popup, and daily reminder webhook | `teams-app/manifest.json` (Teams app registration), `TEAMS_WEBHOOK_URL` used by the `teams-reminder` Edge Function |
| **Domain** | Production URL | `degitasks.degitrans.com` / `degitasks.com` |

### Supabase Edge Functions (`supabase/functions/`)
- `send-invite-email` — sends workspace invite emails via Resend when a member is invited.
- `send-daily-reminders` — cron-triggered (see `supabase/daily-reminders-cron.sql`), emails users their due/overdue tasks daily at 8:30 AM IST.
- `teams-reminder` — posts daily reminders into Microsoft Teams via `TEAMS_WEBHOOK_URL` for users who've opted in.

### Environment variables & secrets
- **Frontend (`.env`)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — safe to expose client-side, see `.env.example`.
- **Vercel project env vars**: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` — required by `api/send-email.js`.
- **Supabase Edge Function secrets** (set via `supabase secrets set` or the dashboard, not in this repo): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `APP_URL`, `TEAMS_WEBHOOK_URL`.
- None of the service-role/API-key secrets are committed to the repo — they must be pulled from the Vercel and Supabase dashboards directly by anyone with project access.

### Deployment
- The documented production workflow is push to `main` → Vercel auto-deploys. Confirm the Git connection and production branch in the existing Vercel project before your first release from this PC. Run `npm run check` before pushing.
- Database changes: apply only the new, reviewed SQL for that feature, in dependency order. No migration runner is configured; do not rerun historical files or rely on alphabetical filename order.
- Edge Function changes: deploy via `supabase functions deploy <name>` (requires Supabase CLI + project link).
- Teams app: packaged via `package-teams.bat` into `degitask-teams.zip`, then uploaded/updated in the Teams admin center or sideloaded for testing.
