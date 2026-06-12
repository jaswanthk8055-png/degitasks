-- Phase 4: Pending invitations + auto-join on signup
-- Run in Supabase SQL Editor after phase2.sql and phase3.sql.

-- ── Pending invitations table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invited_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(email, workspace_id)
);

ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;

-- Workspace members can insert invitations for their own workspaces
CREATE POLICY "pending_inv_insert" ON public.pending_invitations
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Workspace members can read invitations for their workspaces
CREATE POLICY "pending_inv_select" ON public.pending_invitations
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Allow the service role (Edge Function) to delete processed invitations
CREATE POLICY "pending_inv_delete" ON public.pending_invitations
  FOR DELETE USING (true); -- service role bypasses RLS anyway

-- ── Trigger: auto-add user to workspace when they sign up with a pending invite ──
CREATE OR REPLACE FUNCTION public.handle_pending_invitation()
RETURNS trigger AS $$
DECLARE
  inv RECORD;
BEGIN
  -- Look up any pending invitations for the new user's email
  FOR inv IN
    SELECT workspace_id FROM public.pending_invitations
    WHERE email = NEW.email
  LOOP
    -- Add them as a workspace member (ignore if already member)
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (inv.workspace_id, NEW.id, 'member')
    ON CONFLICT DO NOTHING;

    -- Clean up the invitation
    DELETE FROM public.pending_invitations
    WHERE email = NEW.email AND workspace_id = inv.workspace_id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_user_check_invitations ON public.profiles;
CREATE TRIGGER on_new_user_check_invitations
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_pending_invitation();
