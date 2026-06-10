-- Phase 3: Custom columns + column values

-- ── board_columns ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_columns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    uuid REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  type        text NOT NULL DEFAULT 'text'
                CHECK (type IN ('text', 'number', 'date', 'status', 'people', 'checkbox')),
  label       text NOT NULL,
  position    int  NOT NULL DEFAULT 0,
  config      jsonb NOT NULL DEFAULT '{}',
  hidden      boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- ── task_column_values ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_column_values (
  task_id     uuid REFERENCES tasks(id)         ON DELETE CASCADE NOT NULL,
  column_id   uuid REFERENCES board_columns(id) ON DELETE CASCADE NOT NULL,
  value       jsonb,
  PRIMARY KEY (task_id, column_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE board_columns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_column_values  ENABLE ROW LEVEL SECURITY;

-- board_columns: visible/editable to workspace members
CREATE POLICY "bc_workspace_members" ON board_columns
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      JOIN boards b ON b.workspace_id = wm.workspace_id
      WHERE b.id = board_columns.board_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      JOIN boards b ON b.workspace_id = wm.workspace_id
      WHERE b.id = board_columns.board_id
        AND wm.user_id = auth.uid()
    )
  );

-- task_column_values: visible/editable to workspace members
CREATE POLICY "tcv_workspace_members" ON task_column_values
  USING (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      JOIN tasks t ON true
      JOIN boards b ON b.id = t.board_id AND b.workspace_id = wm.workspace_id
      WHERE t.id = task_column_values.task_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM workspace_members wm
      JOIN tasks t ON true
      JOIN boards b ON b.id = t.board_id AND b.workspace_id = wm.workspace_id
      WHERE t.id = task_column_values.task_id
        AND wm.user_id = auth.uid()
    )
  );

-- ── Enable realtime for new tables ───────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE board_columns;
ALTER PUBLICATION supabase_realtime ADD TABLE task_column_values;
