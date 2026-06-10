import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBoardStore } from '../../stores/useBoardStore'
import { supabase } from '../../lib/supabase'

const RECENT_KEY = 'taskflow-recent-searches'
const MAX_RECENT = 5

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const { boards, workspaceId } = useBoardStore()
  const [query, setQuery] = useState('')
  const [allTasks, setAllTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
  })
  const inputRef = useRef(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIdx(0)
    setTimeout(() => inputRef.current?.focus(), 30)

    // Fetch all workspace tasks once
    if (!fetchedRef.current && boards.length > 0) {
      fetchedRef.current = true
      setLoadingTasks(true)
      const boardIds = boards.map((b) => b.id)
      supabase
        .from('tasks')
        .select('id, title, board_id, status, status_color, priority')
        .in('board_id', boardIds)
        .then(({ data }) => {
          setAllTasks(data || [])
          setLoadingTasks(false)
        })
    }
  }, [open, boards.length])

  // Re-fetch if boards change (new board added)
  useEffect(() => {
    fetchedRef.current = false
  }, [workspaceId])

  const trimmedQuery = query.trim().toLowerCase()
  const results = trimmedQuery
    ? allTasks.filter((t) => t.title?.toLowerCase().includes(trimmedQuery))
    : []

  // Group by board name
  const grouped = results.reduce((acc, task) => {
    const board = boards.find((b) => b.id === task.board_id)
    const key = board?.name || 'Unknown Board'
    if (!acc[key]) acc[key] = { board, tasks: [] }
    acc[key].tasks.push(task)
    return acc
  }, {})

  // Flat list for keyboard nav
  const flatResults = results.slice(0, 20)

  const saveRecent = (q) => {
    const next = [q, ...recent.filter((r) => r !== q)].slice(0, MAX_RECENT)
    setRecent(next)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  }

  const handleSelect = (task) => {
    if (trimmedQuery) saveRecent(trimmedQuery)
    onClose()
    navigate(`/board/${task.board_id}`, { state: { openTaskId: task.id } })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, flatResults.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && flatResults[activeIdx]) { handleSelect(flatResults[activeIdx]) }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9000] bg-black/40 flex items-start justify-center pt-[12vh] px-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-[#1e1e1e] rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-[#333] animate-palette-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-200 dark:border-[#333]">
          <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-400 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks across all boards…"
            className="flex-1 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 bg-transparent outline-none"
          />
          {loadingTasks && (
            <div className="w-4 h-4 border-2 border-gray-300 border-t-primary-blue rounded-full animate-spin flex-shrink-0" />
          )}
          <kbd className="text-[11px] text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 flex-shrink-0">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
          {!trimmedQuery ? (
            recent.length > 0 ? (
              <div className="py-1.5">
                <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Recent searches</p>
                {recent.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-[#292929] text-sm text-gray-700 dark:text-gray-300 text-left transition"
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-400 flex-shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {r}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-10 text-center">
                <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-gray-300 mx-auto mb-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-sm text-gray-400">Type to search all tasks</p>
              </div>
            )
          ) : results.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              No tasks matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            Object.entries(grouped).map(([boardName, { board, tasks: groupTasks }]) => (
              <div key={boardName} className="py-1">
                <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                  {board && (
                    <span className="text-sm" style={{ color: board.color }}>{board.icon}</span>
                  )}
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{boardName}</p>
                </div>
                {groupTasks.slice(0, 6).map((task) => {
                  const idx = flatResults.indexOf(task)
                  return (
                    <button
                      key={task.id}
                      onClick={() => handleSelect(task)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
                        idx === activeIdx
                          ? 'bg-blue-50 dark:bg-blue-950/30'
                          : 'hover:bg-gray-50 dark:hover:bg-[#292929]'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: task.status_color || '#c4c4c4' }}
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">
                        {task.title || <em className="text-gray-400">Untitled</em>}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{task.status}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-[#333] flex items-center gap-3 text-[11px] text-gray-400">
          <span><kbd className="border border-gray-200 dark:border-gray-600 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-gray-200 dark:border-gray-600 rounded px-1">↵</kbd> open</span>
          <span><kbd className="border border-gray-200 dark:border-gray-600 rounded px-1">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
