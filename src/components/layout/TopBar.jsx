import { useState, useRef, useEffect } from 'react'
import { useBoardStore } from '../../stores/useBoardStore'
import { useAuthStore, SUPER_USER_EMAIL } from '../../stores/useAuthStore'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../../lib/utils'
import NotificationBell from './NotificationBell'
import Avatar from '../ui/Avatar'

const VIEWS = ['Main Table', 'My Tasks', 'Summary', 'Calendar']

const GROUP_BY_OPTIONS = [
  { value: 'group',    label: 'Group',    desc: 'Your custom sections' },
  { value: 'status',   label: 'Status',   desc: 'By task status' },
  { value: 'priority', label: 'Priority', desc: 'By priority level' },
  { value: 'assignee', label: 'Assignee', desc: 'By team member' },
]

export default function TopBar({
  activeView,
  onViewChange,
  onNewTask,
  onExport,
  onAutomations,
  filters,
  onFiltersChange,
  filterOpen,
  onFilterToggle,
  groupBy = 'group',
  onGroupByChange,
}) {
  const { currentBoard, realtimeConnected, updateBoardName, profiles } = useBoardStore()
  const { user } = useAuthStore()
  const canEdit = user?.email === SUPER_USER_EMAIL
  const [editingName,  setEditingName]  = useState(false)
  const [nameValue,    setNameValue]    = useState('')
  const [groupByOpen,  setGroupByOpen]  = useState(false)
  const groupByRef = useRef(null)

  useEffect(() => {
    if (!groupByOpen) return
    const handler = (e) => { if (!groupByRef.current?.contains(e.target)) setGroupByOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [groupByOpen])

  const startEdit = () => {
    setNameValue(currentBoard?.name || '')
    setEditingName(true)
  }

  const commitEdit = async () => {
    setEditingName(false)
    if (nameValue.trim() && nameValue !== currentBoard?.name) {
      await updateBoardName(currentBoard.id, nameValue.trim())
    }
  }

  const activeFilterCount = filters
    ? filters.assigneeIds.length +
      filters.statuses.length +
      filters.priorities.length +
      (filters.dueThisWeek ? 1 : 0)
    : 0

  const toggleAssignee = (id) => {
    const next = filters.assigneeIds.includes(id)
      ? filters.assigneeIds.filter((x) => x !== id)
      : [...filters.assigneeIds, id]
    onFiltersChange({ ...filters, assigneeIds: next })
  }

  const toggleStatus = (label) => {
    const next = filters.statuses.includes(label)
      ? filters.statuses.filter((x) => x !== label)
      : [...filters.statuses, label]
    onFiltersChange({ ...filters, statuses: next })
  }

  const togglePriority = (label) => {
    const next = filters.priorities.includes(label)
      ? filters.priorities.filter((x) => x !== label)
      : [...filters.priorities, label]
    onFiltersChange({ ...filters, priorities: next })
  }

  const clearAll = () => {
    onFiltersChange({ assigneeIds: [], statuses: [], priorities: [], dueThisWeek: false })
  }

  return (
    <div className="flex-shrink-0">
      {/* Main bar */}
      <div className="min-h-14 bg-white dark:bg-[#1e1e1e] border-b border-border-color dark:border-[#333] flex flex-wrap items-center px-4 gap-x-3 gap-y-2 py-2">
        {/* Board name */}
        <div className="flex items-center min-w-0 gap-2">
          {editingName ? (
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setEditingName(false)
              }}
              className="text-base font-semibold text-gray-900 dark:text-white border-b-2 border-primary-blue outline-none bg-transparent px-0.5 min-w-0"
            />
          ) : (
            <h1
              onDoubleClick={startEdit}
              className="text-base font-semibold text-gray-900 dark:text-gray-100 cursor-default hover:text-primary-blue dark:hover:text-primary-blue transition select-none truncate max-w-[160px] sm:max-w-none"
              title="Double-click to rename"
            >
              {currentBoard?.name || ''}
            </h1>
          )}
          {/* Live indicator */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                realtimeConnected ? 'bg-status-green' : 'bg-gray-300'
              }`}
            />
            {realtimeConnected && (
              <span className="text-[11px] text-status-green font-medium">Live</span>
            )}
          </div>
        </div>

        {/* View switcher — horizontally scrollable on small screens */}
        <div className="flex items-center border border-border-color dark:border-[#444] rounded-lg overflow-x-auto flex-shrink-0">
          {VIEWS.map((view) => (
            <button
              key={view}
              onClick={() => onViewChange(view)}
              className={`px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                activeView === view
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-primary-blue'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
              } ${view !== VIEWS[0] ? 'border-l border-border-color dark:border-[#444]' : ''}`}
            >
              {view}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Filter */}
          {onFilterToggle && (
            <button
              onClick={onFilterToggle}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition ${
                filterOpen || activeFilterCount > 0
                  ? 'border-primary-blue text-primary-blue bg-blue-50 dark:bg-blue-900/20'
                  : 'border-border-color dark:border-[#444] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 12h10M11 20h2" />
              </svg>
              Filter
              {activeFilterCount > 0 && (
                <span className="ml-0.5 min-w-[16px] h-[16px] bg-primary-blue text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          {/* Group By */}
          {activeView === 'Main Table' && onGroupByChange && (
            <div className="relative" ref={groupByRef}>
              <button
                onClick={() => setGroupByOpen((p) => !p)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition ${
                  groupByOpen || groupBy !== 'group'
                    ? 'border-primary-blue text-primary-blue bg-blue-50 dark:bg-blue-900/20'
                    : 'border-border-color dark:border-[#444] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h10M4 14h16M4 18h10" />
                </svg>
                Group by
                {groupBy !== 'group' && (
                  <span className="ml-0.5 px-1.5 py-0.5 bg-primary-blue text-white text-[10px] font-bold rounded-full leading-none">
                    {GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label}
                  </span>
                )}
              </button>

              {groupByOpen && (
                <div className="absolute right-0 top-full mt-1.5 bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#444] rounded-xl shadow-xl z-[9999] w-48 py-1.5 animate-dropdown">
                  <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Group tasks by</p>
                  {GROUP_BY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { onGroupByChange(opt.value); setGroupByOpen(false) }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition ${
                        groupBy === opt.value
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-primary-blue'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition ${
                        groupBy === opt.value ? 'border-primary-blue bg-primary-blue' : 'border-gray-300 dark:border-[#555]'
                      }`} />
                      <div>
                        <div className="font-medium leading-tight">{opt.label}</div>
                        <div className="text-[11px] text-gray-400 dark:text-gray-500">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Automations — super user only */}
          {canEdit && onAutomations && (
            <button
              onClick={onAutomations}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border-color dark:border-[#444] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition"
              title="Automations"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Automations
            </button>
          )}

          {/* Export */}
          {onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border-color dark:border-[#444] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition"
              title="Export as CSV"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
          )}

          {/* Notification bell */}
          <NotificationBell />

          {/* New Task */}
          <button
            onClick={onNewTask}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary-blue text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition shadow-sm"
          >
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            New Task
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {filterOpen && filters && (
        <div className="bg-white dark:bg-[#1e1e1e] border-b border-border-color dark:border-[#333] px-4 py-2.5 flex flex-wrap items-center gap-3 animate-dropdown">
          {profiles.length > 0 && (
            <FilterSection label="Assignee">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleAssignee(p.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition ${
                    filters.assigneeIds.includes(p.id)
                      ? 'bg-primary-blue/10 border-primary-blue text-primary-blue'
                      : 'border-gray-200 dark:border-[#444] text-gray-600 dark:text-gray-400 hover:border-gray-300 bg-white dark:bg-transparent'
                  }`}
                >
                  <Avatar name={p.full_name} color={p.avatar_color} size="xs" />
                  {p.full_name}
                </button>
              ))}
            </FilterSection>
          )}

          <FilterSection label="Status">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => toggleStatus(s.label)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                  filters.statuses.includes(s.label)
                    ? 'border-transparent text-white'
                    : 'border-gray-200 dark:border-[#444] text-gray-600 dark:text-gray-400 hover:border-gray-300 bg-white dark:bg-transparent'
                }`}
                style={filters.statuses.includes(s.label) ? { backgroundColor: s.color } : {}}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                {s.label}
              </button>
            ))}
          </FilterSection>

          <FilterSection label="Priority">
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p.label}
                onClick={() => togglePriority(p.label)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                  filters.priorities.includes(p.label)
                    ? 'border-transparent text-white'
                    : 'border-gray-200 dark:border-[#444] text-gray-600 dark:text-gray-400 hover:border-gray-300 bg-white dark:bg-transparent'
                }`}
                style={filters.priorities.includes(p.label) ? { backgroundColor: p.color } : {}}
              >
                {p.label}
              </button>
            ))}
          </FilterSection>

          <button
            onClick={() => onFiltersChange({ ...filters, dueThisWeek: !filters.dueThisWeek })}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
              filters.dueThisWeek
                ? 'bg-primary-blue/10 border-primary-blue text-primary-blue'
                : 'border-gray-200 dark:border-[#444] text-gray-600 dark:text-gray-400 hover:border-gray-300 bg-white dark:bg-transparent'
            }`}
          >
            Due this week
          </button>

          {activeFilterCount > 0 && (
            <button
              onClick={clearAll}
              className="ml-auto text-xs text-gray-500 hover:text-red-500 transition underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FilterSection({ label, children }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">{label}:</span>
      {children}
    </div>
  )
}
