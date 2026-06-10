import { useState, useMemo } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  parseISO,
  isSameMonth,
  isSameDay,
} from 'date-fns'
import { useBoardStore } from '../../stores/useBoardStore'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarView({ onOpenTask }) {
  const { tasks } = useBoardStore()
  const [current, setCurrent] = useState(new Date())

  const monthStart = startOfMonth(current)
  const monthEnd = endOfMonth(current)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const tasksWithDate = useMemo(() => tasks.filter((t) => !!t.due_date), [tasks])
  const tasksWithoutDate = useMemo(() => tasks.filter((t) => !t.due_date), [tasks])

  const getTasksForDay = (day) =>
    tasksWithDate.filter((t) => {
      try { return isSameDay(parseISO(t.due_date), day) } catch { return false }
    })

  return (
    <div className="flex-1 flex overflow-hidden bg-white dark:bg-[#111]">
      {/* ── Main calendar grid ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Nav header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 dark:border-[#333] flex-shrink-0">
          <button
            onClick={() => setCurrent((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition"
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 min-w-[120px] text-center">
            {format(current, 'MMMM yyyy')}
          </h2>
          <button
            onClick={() => setCurrent((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition"
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrent(new Date())}
            className="ml-2 px-3 py-1 text-xs font-medium border border-gray-300 dark:border-[#444] rounded-lg hover:bg-gray-50 dark:hover:bg-white/10 transition text-gray-600 dark:text-gray-400"
          >
            Today
          </button>
        </div>

        {/* DOW headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-[#333] flex-shrink-0">
          {DOW_LABELS.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto scrollbar-thin">
          <div className="grid grid-cols-7 border-l border-t border-gray-200 dark:border-[#333]">
            {days.map((day) => {
              const dayTasks = getTasksForDay(day)
              const inMonth = isSameMonth(day, current)
              const today = isToday(day)

              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[90px] border-r border-b border-gray-200 dark:border-[#333] p-1.5 ${
                    inMonth
                      ? 'bg-white dark:bg-[#1a1a1a]'
                      : 'bg-gray-50/60 dark:bg-black/20'
                  }`}
                >
                  <div className="flex justify-end mb-1">
                    <span
                      className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full transition ${
                        today
                          ? 'bg-primary-blue text-white'
                          : inMonth
                          ? 'text-gray-700 dark:text-gray-300'
                          : 'text-gray-300 dark:text-gray-600'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    {dayTasks.slice(0, 3).map((task) => (
                      <button
                        key={task.id}
                        onClick={() => onOpenTask(task)}
                        className="w-full text-left text-[10px] font-medium px-1.5 py-0.5 rounded text-white truncate hover:opacity-80 transition"
                        style={{ backgroundColor: task.status_color || '#c4c4c4' }}
                        title={task.title}
                      >
                        {task.title || 'Untitled'}
                      </button>
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-[10px] text-gray-400 px-1.5">
                        +{dayTasks.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── No-date sidebar ── */}
      <div className="w-56 flex-shrink-0 border-l border-gray-200 dark:border-[#333] flex flex-col bg-gray-50/40 dark:bg-[#111]">
        <div className="px-3 py-3 border-b border-gray-200 dark:border-[#333]">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">No date</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {tasksWithoutDate.length} task{tasksWithoutDate.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
          {tasksWithoutDate.length === 0 ? (
            <p className="text-xs text-gray-400 text-center mt-4">All tasks have due dates</p>
          ) : (
            tasksWithoutDate.map((task) => (
              <button
                key={task.id}
                onClick={() => onOpenTask(task)}
                className="w-full text-left px-2.5 py-2 rounded-lg border border-gray-200 dark:border-[#333] bg-white dark:bg-[#1a1a1a] hover:border-primary-blue hover:shadow-sm transition"
              >
                <p className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate">
                  {task.title || 'Untitled'}
                </p>
                <span
                  className="text-[10px] text-white px-1.5 py-0.5 rounded mt-1 inline-block"
                  style={{ backgroundColor: task.status_color || '#c4c4c4' }}
                >
                  {task.status}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
