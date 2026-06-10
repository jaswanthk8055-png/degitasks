import { useState, useEffect, useMemo } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { isThisWeek, isPast, parseISO, addDays, isWithinInterval } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useBoardStore } from '../stores/useBoardStore'
import { STATUS_OPTIONS, formatDueDate } from '../lib/utils'
import Avatar from '../components/ui/Avatar'

export default function DashboardPage() {
  const { workspace } = useOutletContext() || {}
  const { boards, profiles } = useBoardStore()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspace?.id || boards.length === 0) return
    const boardIds = boards.map((b) => b.id)
    setLoading(true)
    supabase
      .from('tasks')
      .select('*')
      .in('board_id', boardIds)
      .then(({ data }) => {
        setTasks(data || [])
        setLoading(false)
      })
  }, [workspace?.id, boards.length])

  const now = new Date()
  const weekEnd = addDays(now, 7)

  const total = tasks.length
  const doneTasks = useMemo(() => tasks.filter((t) => t.status === 'Done'), [tasks])
  const doneThisWeek = useMemo(
    () =>
      doneTasks.filter((t) => {
        try { return t.updated_at && isThisWeek(parseISO(t.updated_at), { weekStartsOn: 1 }) }
        catch { return false }
      }),
    [doneTasks]
  )
  const overdue = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.status === 'Done' || !t.due_date) return false
        try { return isPast(parseISO(t.due_date)) } catch { return false }
      }),
    [tasks]
  )
  const upcoming = useMemo(
    () =>
      tasks
        .filter((t) => {
          if (!t.due_date || t.status === 'Done') return false
          try {
            return isWithinInterval(parseISO(t.due_date), { start: now, end: weekEnd })
          } catch { return false }
        })
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [tasks]
  )

  const byStatus = useMemo(
    () =>
      STATUS_OPTIONS.map((s) => ({
        ...s,
        count: tasks.filter((t) => t.status === s.label).length,
      })),
    [tasks]
  )
  const maxStatusCount = Math.max(...byStatus.map((s) => s.count), 1)

  const byMember = useMemo(
    () =>
      profiles
        .map((p) => ({
          ...p,
          count: tasks.filter((t) => t.assignee_id === p.id && t.status !== 'Done').length,
        }))
        .filter((p) => p.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
    [tasks, profiles]
  )

  // Last-7-days done sparkline data
  const sparkData = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(now, -6 + i)
        return doneTasks.filter((t) => {
          try {
            if (!t.updated_at) return false
            return parseISO(t.updated_at).toDateString() === d.toDateString()
          } catch { return false }
        }).length
      }),
    [doneTasks]
  )

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-[#111]">
        <div className="w-6 h-6 border-2 border-primary-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto scrollbar-thin bg-gray-50 dark:bg-[#111] p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Summary Dashboard</h1>

        {/* Top stat cards */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <StatCard title="Total Tasks" value={total} accent="#0073ea" />
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#333] p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Done This Week</p>
            <div className="flex items-end gap-3">
              <span className="text-3xl font-bold text-status-green">{doneThisWeek.length}</span>
              <Sparkline data={sparkData} color="#00c875" />
            </div>
          </div>
          <StatCard title="Overdue Tasks" value={overdue.length} accent="#e2445c" />
        </div>

        {/* Middle row */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          {/* Tasks by status */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#333] p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Tasks by Status</p>
            <div className="space-y-2.5">
              {byStatus.map((s) => (
                <div key={s.label} className="flex items-center gap-2.5">
                  <span className="text-xs text-gray-600 dark:text-gray-400 w-28 flex-shrink-0 truncate">{s.label}</span>
                  <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(s.count / maxStatusCount) * 100}%`, backgroundColor: s.color }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-5 text-right flex-shrink-0">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Tasks by member */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#333] p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Open Tasks by Member</p>
            {byMember.length === 0 ? (
              <p className="text-sm text-gray-400 mt-2">No assigned open tasks</p>
            ) : (
              <div className="space-y-2.5">
                {byMember.map((member, i) => (
                  <div key={member.id} className="flex items-center gap-2.5">
                    <span className="text-xs text-gray-400 w-4 flex-shrink-0">{i + 1}.</span>
                    <Avatar name={member.full_name} color={member.avatar_color} size="xs" />
                    <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{member.full_name}</span>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0">{member.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming deadlines */}
        <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#333] p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Upcoming Deadlines (Next 7 Days)
          </p>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming deadlines in the next 7 days</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
              {upcoming.slice(0, 8).map((task) => {
                const board = boards.find((b) => b.id === task.board_id)
                return (
                  <div key={task.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: task.status_color || '#c4c4c4' }}
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">
                      {task.title || 'Untitled'}
                    </span>
                    {board && (
                      <Link
                        to={`/board/${board.id}`}
                        className="text-xs text-gray-400 hover:text-primary-blue transition flex-shrink-0"
                      >
                        {board.icon} {board.name}
                      </Link>
                    )}
                    <span className="text-xs font-medium text-status-orange flex-shrink-0">
                      {formatDueDate(task.due_date)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, accent }) {
  return (
    <div
      className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#333] p-4 shadow-sm"
      style={{ borderTopWidth: '3px', borderTopColor: accent }}
    >
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      <span className="text-3xl font-bold" style={{ color: accent }}>{value}</span>
    </div>
  )
}

function Sparkline({ data, color }) {
  const h = 36
  const w = 72
  const max = Math.max(...data, 1)
  const step = w / Math.max(data.length - 1, 1)
  const points = data.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`).join(' ')

  return (
    <svg width={w} height={h} className="ml-auto flex-shrink-0">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={h - (v / max) * (h - 4) - 2}
          r={v > 0 ? 2.5 : 0}
          fill={color}
        />
      ))}
    </svg>
  )
}
