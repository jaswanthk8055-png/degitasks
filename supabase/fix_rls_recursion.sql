-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: Infinite recursion in RLS policies (error 42P17)
--
-- Root cause:
--   workspaces SELECT policy  → subquery on workspace_members
--   workspace_members SELECT policy → subquery on workspaces
--   → circular reference → 500 Internal Server Error on every workspace query
--
-- Solution: break the cycle using SECURITY DEFINER helper functions.
--   Security-definer functions bypass RLS when they run, so they can safely
--   query either table without triggering the other's policy.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Helper: check if the current user is a member of a workspace
--    (runs without RLS, so it won't trigger workspaces policy → no cycle)
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
begin
  return exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id
      and user_id = auth.uid()
  );
end;
$$;

-- 2. Helper: check if the current user owns a workspace
--    (runs without RLS, so it won't trigger workspace_members policy → no cycle)
create or replace function public.is_workspace_owner(ws_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
begin
  return exists (
    select 1 from public.workspaces
    where id = ws_id
      and owner_id = auth.uid()
  );
end;
$$;

-- 3. Fix workspaces SELECT policy
drop policy if exists "workspaces_select" on public.workspaces;
create policy "workspaces_select" on public.workspaces for select
  using (
    owner_id = auth.uid()
    or is_workspace_member(id)   -- uses security-definer fn → no cycle
  );

-- 4. Fix workspace_members SELECT policy
drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select" on public.workspace_members for select
  using (
    user_id = auth.uid()
    or is_workspace_owner(workspace_id)   -- uses security-definer fn → no cycle
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify (run these SELECT statements to confirm no 500 errors):
--   select * from public.workspaces;
--   select * from public.workspace_members;
-- ─────────────────────────────────────────────────────────────────────────────
