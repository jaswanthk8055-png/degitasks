// Use immutable IDs so renaming or moving a task between projects keeps its link.
export function taskPath(task) {
  if (typeof task?.board_id !== 'string' || !task.board_id.trim()
    || typeof task?.id !== 'string' || !task.id.trim()) {
    throw new TypeError('A task link requires a board ID and task ID')
  }
  return `/board/${encodeURIComponent(task.board_id)}?task=${encodeURIComponent(task.id)}`
}
