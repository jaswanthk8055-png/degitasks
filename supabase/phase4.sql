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
  FOR DELETE USING (true);

-- ── Trigger: auto-add user to workspace when they sign up with a pending invite ──
-- NOTE: The trigger fires on public.profiles INSERT (id = auth user id).
--       profiles has no email column, so we look it up from auth.users.
CREATE OR REPLACE FUNCTION public.handle_pending_invitation()
RETURNS trigger AS $$
DECLARE
  inv        RECORD;
  user_email text;
BEGIN
  -- Resolve the email from auth.users using the profile id
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = NEW.id;

  IF user_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check for any pending invitations for this email
  FOR inv IN
    SELECT workspace_id FROM public.pending_invitations
    WHERE email = lower(user_email)
  LOOP
    -- Add them as a workspace member (ignore if already a member)
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (inv.workspace_id, NEW.id, 'member')
    ON CONFLICT DO NOTHING;

    -- Clean up the processed invitation
    DELETE FROM public.pending_invitations
    WHERE email = lower(user_email) AND workspace_id = inv.workspace_id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_user_check_invitations ON public.profiles;
CREATE TRIGGER on_new_user_check_invitations
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_pending_invitation();
