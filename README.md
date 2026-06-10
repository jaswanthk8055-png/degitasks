# DegiTasks

A collaborative task management web app inspired by Monday.com's UI/UX.

Built with React 18 + Vite, Tailwind CSS v3, Supabase, Zustand, and @dnd-kit.

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier is sufficient)

---

## Setup

### 1. Install dependencies

```bash
cd degitasks
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Wait for the project to be provisioned (~1 minute).

### 3. Run the database schema

1. In your Supabase dashboard, navigate to **SQL Editor**.
2. Open `supabase/schema.sql` from this project.
3. Paste the entire contents into the SQL editor and click **Run**.

This creates all tables, Row Level Security policies, triggers (auto-create profile on signup, auto-update `updated_at`), and enables Realtime for `tasks`, `groups`, and `boards`.

### 4. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Find these in your Supabase dashboard under **Settings → API**.

### 5. Start the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## First run

1. Navigate to `/signup` and create an account.
2. DegiTasks automatically creates a default workspace, a **"My First Board"** board with two groups ("To Do" and "In Progress") and three placeholder tasks.
3. You are redirected to the board immediately after signup.

---

## Features (Phase 1)

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
| Kanban view | 🔜 Phase 2 |
| Calendar view | 🔜 Phase 2 |

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
└── schema.sql       Full database schema with RLS
```

---

## Tech stack

- **React 18** + **Vite** — frontend framework & build tool
- **Tailwind CSS v3** — utility-first styling
- **Supabase** — auth, PostgreSQL database, realtime subscriptions
- **React Router v6** — client-side routing
- **Zustand** — lightweight client state management
- **@dnd-kit** — accessible drag-and-drop
- **date-fns** — date formatting utilities
