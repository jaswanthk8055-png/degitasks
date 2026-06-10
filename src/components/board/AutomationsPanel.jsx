import { useState, useEffect } from 'react'
import { useBoardStore } from '../../stores/useBoardStore'
import Modal from '../ui/Modal'

export default function AutomationsPanel({ open, onClose }) {
  const { currentBoard, groups, statusOptions, automations, updateAutomations } = useBoardStore()
  const boardId = currentBoard?.id

  const [creating,   setCreating]   = useState(false)
  const [newTrigger, setNewTrigger] = useState('')
  const [newGroupId, setNewGroupId] = useState('')

  useEffect(() => {
    if (statusOptions.length > 0 && !newTrigger) setNewTrigger(statusOptions[0]?.label || '')
  }, [statusOptions])

  useEffect(() => {
    if (groups.length > 0 && !newGroupId) setNewGroupId(groups[0].id)
  }, [groups])

  const persist = (list) => updateAutomations(boardId, list)

  const handleAdd = () => {
    if (!newGroupId || !newTrigger) return
    const rule = {
      id: crypto.randomUUID(),
      enabled: true,
      trigger: { type: 'status_change', value: newTrigger },
      action:  { type: 'move_to_group', groupId: newGroupId },
    }
    persist([...automations, rule])
    setCreating(false)
  }

  const toggleEnabled = (id) => {
    persist(automations.map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a))
  }

  const deleteRule = (id) => {
    persist(automations.filter((a) => a.id !== id))
  }

  return (
    <Modal open={open} onClose={onClose} title="Automations">
      <div className="space-y-3 min-w-[420px]">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Automatically perform actions when conditions are met on this board.
        </p>

        {automations.length === 0 && !creating && (
          <div className="py-8 text-center text-sm text-gray-400">
            No automations yet. Create one below.
          </div>
        )}

        {automations.map((rule) => {
          const triggerLabel = rule.trigger.value
          const groupName = groups.find((g) => g.id === rule.action.groupId)?.name || 'Unknown group'
          return (
            <div
              key={rule.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition ${
                rule.enabled
                  ? 'border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-gray-200 dark:border-[#333] bg-gray-50 dark:bg-[#1e1e1e] opacity-60'
              }`}
            >
              <div className="flex-1 min-w-0">
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  When status changes to{' '}
                  <span className="font-semibold text-primary-blue">{triggerLabel}</span>
                  {' → '}Move task to{' '}
                  <span className="font-semibold text-primary-blue">{groupName}</span>
                </span>
              </div>

              <button
                onClick={() => toggleEnabled(rule.id)}
                title={rule.enabled ? 'Disable' : 'Enable'}
                className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
                  rule.enabled ? 'bg-primary-blue' : 'bg-gray-300 dark:bg-[#444]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                    rule.enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>

              <button
                onClick={() => deleteRule(rule.id)}
                className="text-gray-300 hover:text-red-400 transition flex-shrink-0"
                title="Delete rule"
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })}

        {creating ? (
          <div className="border border-gray-200 dark:border-[#444] rounded-lg p-3 space-y-3 bg-gray-50 dark:bg-[#1e1e1e]">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New automation</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600 dark:text-gray-400 flex-shrink-0">When status =</span>
              <select
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                className="flex-1 min-w-[120px] px-2 py-1 text-sm border border-gray-300 dark:border-[#444] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-blue bg-white dark:bg-[#252525] dark:text-white"
              >
                {statusOptions.map((s) => (
                  <option key={s.label} value={s.label}>{s.label}</option>
                ))}
              </select>
              <span className="text-sm text-gray-600 dark:text-gray-400 flex-shrink-0">→ Move to</span>
              <select
                value={newGroupId}
                onChange={(e) => setNewGroupId(e.target.value)}
                className="flex-1 min-w-[120px] px-2 py-1 text-sm border border-gray-300 dark:border-[#444] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-blue bg-white dark:bg-[#252525] dark:text-white"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCreating(false)}
                className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 dark:bg-[#333] dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#444] rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!newGroupId || !newTrigger}
                className="px-3 py-1.5 text-xs text-white bg-primary-blue hover:bg-blue-600 rounded-lg transition disabled:opacity-50"
              >
                Add rule
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 text-xs text-primary-blue hover:text-blue-600 transition px-1 py-1"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            Create automation
          </button>
        )}
      </div>
    </Modal>
  )
}
