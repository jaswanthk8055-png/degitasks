import { format, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns'

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

export function avatarColorFromName(name) {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
