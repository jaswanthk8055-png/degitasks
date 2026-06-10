-- Allow workspace owner to remove members
create policy "workspace_members_delete" on public.workspace_members for delete
  using (workspace_id in (select id from public.workspaces where owner_id = auth.uid()));
