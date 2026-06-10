import { useState, useRef } from 'react'
import { STATUS_COLORS } from '../../lib/utils'
import { useBoardStore } from '../../stores/useBoardStore'
import { useAuthStore, SUPER_USER_EMAIL } from '../../stores/useAuthStore'
import Dropdown from '../ui/Dropdown'
import Modal from '../ui/Modal'

export default function StatusPill({ status, statusColor, taskId, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const btnRef = useRef(null)

  const { statusOptions, currentBoard, updateStatusOptions } = useBoardStore()
  const { user } = useAuthStore()
  const canEdit = user?.email === SUPER_USER_EMAIL

  const options = statusOptions.length > 0 ? statusOptions : []

  const handleSelect = (option) => {
    setOpen(false)
    onUpdate(taskId, { status: option.label, status_color: option.color })
  }

  const color = statusColor || options.find((o) => o.label === status)?.color || '#c4c4c4'

  return (
    <div className="relative w-full">
      <button
        ref={btnRef}
        onClick={() => setOpen((p) => !p)}
        className="w-full h-6 px-2 rounded text-[11px] font-semibold text-white transition hover:opacity-85 focus:outline-none truncate"
        style={{ backgroundColor: color }}
      >
        {status || 'Not Started'}
      </button>

      <Dropdown open={open} onClose={() => setOpen(false)} className="w-48" anchorRef={btnRef}>
        {options.map((opt) => (
          <button
            key={opt.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSelect(opt)}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-sm text-gray-700 dark:text-gray-300 transition"
          >
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: opt.color }} />
            {opt.label}
          </button>
        ))}

        {canEdit && (
          <>
            <div className="my-1 border-t border-gray-100 dark:border-[#333]" />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setOpen(false); setManaging(true) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-primary-blue hover:bg-gray-50 dark:hover:bg-white/5 transition"
            >
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Manage statuses
            </button>
          </>
        )}
      </Dropdown>

      {managing && (
        <ManageStatusModal
          options={options}
          boardId={currentBoard?.id}
          onSave={(newOptions) => {
            updateStatusOptions(currentBoard.id, newOptions)
            setManaging(false)
          }}
          onClose={() => setManaging(false)}
        />
      )}
    </div>
  )
}

function ManageStatusModal({ options, boardId, onSave, onClose }) {
  const [draft, setDraft] = useState(options.map((o) => ({ ...o, _id: Math.random() })))
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(STATUS_COLORS[0])

  const updateLabel = (idx, label) => {
    setDraft((d) => d.map((o, i) => i === idx ? { ...o, label } : o))
  }

  const updateColor = (idx, color) => {
    setDraft((d) => d.map((o, i) => i === idx ? { ...o, color } : o))
  }

  const remove = (idx) => {
    if (draft.length <= 1) return
    setDraft((d) => d.filter((_, i) => i !== idx))
  }

  const addStatus = () => {
    if (!newLabel.trim()) return
    setDraft((d) => [...d, { label: newLabel.trim(), color: newColor, _id: Math.random() }])
    setNewLabel('')
    setNewColor(STATUS_COLORS[0])
  }

  const handleSave = () => {
    const cleaned = draft
      .filter((o) => o.label.trim())
      .map(({ label, color }) => ({ label, color }))
    if (cleaned.length === 0) return
    onSave(cleaned)
  }

  return (
    <Modal open onClose={onClose} title="Manage Statuses">
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {draft.map((opt, idx) => (
          <div key={opt._id} className="flex items-center gap-2">
            <ColorSwatch color={opt.color} onChange={(c) => updateColor(idx, c)} />
            <input
              value={opt.label}
              onChange={(e) => updateLabel(idx, e.target.value)}
              className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 dark:border-[#444] rounded-lg bg-white dark:bg-[#252525] dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-blue"
            />
            <button
              onClick={() => remove(idx)}
              disabled={draft.length <= 1}
              className="text-gray-300 hover:text-red-400 transition disabled:opacity-30 disabled:cursor-not-allowed p-1"
              title="Remove"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-gray-100 dark:border-[#333] pt-3">
        <ColorSwatch color={newColor} onChange={setNewColor} />
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addStatus() }}
          placeholder="New status label"
          className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 dark:border-[#444] rounded-lg bg-white dark:bg-[#252525] dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-blue"
        />
        <button
          onClick={addStatus}
          disabled={!newLabel.trim()}
          className="px-3 py-1.5 text-xs text-white bg-primary-blue rounded-lg hover:bg-blue-600 transition disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <div className="flex gap-2 justify-end mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-[#333] dark:text-gray-300 dark:hover:bg-[#3a3a3a] rounded-lg transition">
          Cancel
        </button>
        <button onClick={handleSave} className="px-4 py-2 text-sm text-white bg-primary-blue hover:bg-blue-600 rounded-lg transition">
          Save
        </button>
      </div>
    </Modal>
  )
}

function ColorSwatch({ color, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-6 h-6 rounded-full border-2 border-white dark:border-[#333] shadow transition hover:scale-110"
        style={{ backgroundColor: color }}
        title="Pick color"
      />
      {open && (
        <div
          className="absolute left-0 top-8 z-[9999] bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#444] rounded-lg shadow-xl p-2 flex flex-wrap gap-1.5 w-[148px]"
          onMouseLeave={() => setOpen(false)}
        >
          {STATUS_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false) }}
              className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0"
              style={{
                backgroundColor: c,
                outline: c === color ? `2px solid ${c}` : 'none',
                outlineOffset: '2px',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
