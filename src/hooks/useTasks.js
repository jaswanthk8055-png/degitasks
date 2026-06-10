import { useBoardStore } from '../stores/useBoardStore'

export function useTasks(groupId) {
  const tasks = useBoardStore((s) =>
    s.tasks
      .filter((t) => t.group_id === groupId)
      .sort((a, b) => a.position - b.position)
  )
  return { tasks }
}
