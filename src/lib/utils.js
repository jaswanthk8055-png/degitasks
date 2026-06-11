import { format, isToday, isTomorrow, isYesterday, isThisWeek, parseISO } from 'date-fns'

export const GROUP_COLORS = [
  '#0073ea', '#00c875', '#e2445c', '#fdab3d', '#9d50dd',
  '#00c2cd', '#ff7575', '#7e3af2', '#037f4c', '#bb3354',
]

export const STATUS_OPTIONS = [
  { label: 'Not Started', color: '#c4c4c4' },
  { label: 'Working on it', color: '#fdab3d' },
  { label: 'Done', color: '#00c875' },
  { label: 'Stuck', color: '#e2445c' },
  { label: 'In Review', color: '#0086c0' },
]

export const STATUS_COLORS = [
  '#c4c4c4', '#fdab3d', '#00c875', '#e2445c', '#0086c0',
  '#9d50dd', '#037f4c', '#ff7575', '#bb3354', '#7e3af2',
  '#0073ea', '#579bfc', '#333333', '#00c2cd', '#f65f7c',
]

export function loadStatusOptions(boardId) {
  try {
    const raw = localStorage.getItem(`status-options-${boardId}`)
    return raw ? JSON.parse(raw) : [...STATUS_OPTIONS]
  } catch {
    return [...STATUS_OPTIONS]
  }
}

export function saveStatusOptionsToStorage(boardId, options) {
  try {
    localStorage.setItem(`status-options-${boardId}`, JSON.stringify(options))
  } catch {}
}

export const PRIORITY_OPTIONS = [
  { label: 'Low', color: '#579bfc' },
  { label: 'Medium', color: '#fdab3d' },
  { label: 'High', color: '#e2445c' },
  { label: 'Critical', color: '#333333' },
]

export function getInitials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function formatDueDate(dateStr) {
  if (!dateStr) return null
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
    if (isToday(date)) return 'Today'
    if (isTomorrow(date)) return 'Tomorrow'
    if (isYesterday(date)) return 'Yesterday'
    return format(date, 'MMM d')
  } catch {
    return dateStr
  }
}

export function randomGroupColor() {
  return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)]
}

export function generateId() {
  return crypto.randomUUID()
}

export function clsx(...classes) {
  return classes.filter(Boolean).join(' ')
}

export const AVATAR_COLORS = [
  '#0073ea', '#00c875', '#e2445c', '#fdab3d', '#9d50dd',
  '#037f4c', '#ff7575', '#0086c0', '#bb3354', '#7e3af2',
]

export function applyTaskFilters(tasks, filters) {
  if (!filters) return tasks
  return tasks.filter((task) => {
    if (filters.assigneeIds.length > 0 && !filters.assigneeIds.includes(task.assignee_id)) return false
    if (filters.statuses.length > 0    && !filters.statuses.includes(task.status))          return false
    if (filters.priorities.length > 0  && !filters.priorities.includes(task.priority))      return false
    if (filters.dueThisWeek) {
      if (!task.due_date) return false
      try { if (!isThisWeek(parseISO(task.due_date), { weekStartsOn: 1 })) return false } catch { return false }
    }
    return true
  })
}

export function avatarColorFromName(name) {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
