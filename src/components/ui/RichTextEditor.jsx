import { useEffect, useRef, useState } from 'react'

const FORMATS = [
  { command: 'bold',          label: 'B',  title: 'Bold (Ctrl+B)',      className: 'font-bold' },
  { command: 'italic',        label: 'I',  title: 'Italic (Ctrl+I)',    className: 'italic' },
  { command: 'underline',     label: 'U',  title: 'Underline (Ctrl+U)', className: 'underline' },
  { command: 'strikeThrough', label: 'S',  title: 'Strikethrough',      className: 'line-through' },
]

export default function RichTextEditor({ value, onChange, placeholder, readOnly = false }) {
  const editorRef    = useRef(null)
  const lastEmitted  = useRef(value || '')
  const [active, setActive] = useState({ bold: false, italic: false, underline: false, strikeThrough: false })

  // Sync value → innerHTML only when it changes externally (e.g. different task opened)
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (value !== lastEmitted.current) {
      el.innerHTML     = value || ''
      lastEmitted.current = value || ''
    }
  }, [value])

  // Update toolbar active state on every selection change
  useEffect(() => {
    const update = () => {
      try {
        setActive({
          bold:          document.queryCommandState('bold'),
          italic:        document.queryCommandState('italic'),
          underline:     document.queryCommandState('underline'),
          strikeThrough: document.queryCommandState('strikeThrough'),
        })
      } catch (_) {}
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  const execFormat = (command) => {
    document.execCommand(command, false, null)
    editorRef.current?.focus()
  }

  const handleInput = () => {
    const el  = editorRef.current
    if (!el) return
    const raw = el.innerHTML
    const html = raw === '<br>' || raw === '' ? '' : raw
    lastEmitted.current = html
    onChange?.(html)
  }

  const btnBase = 'w-7 h-7 flex items-center justify-center rounded transition text-sm select-none'
  const btnActive = 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
  const btnIdle   = 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-[#3a3a3a] dark:hover:text-gray-200'

  return (
    <div className="border border-gray-200 dark:border-[#444] rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-[#444] bg-gray-50 dark:bg-[#252525]">
          {FORMATS.map(({ command, label, title, className }) => (
            <button
              key={command}
              type="button"
              title={title}
              onMouseDown={(e) => { e.preventDefault(); execFormat(command) }}
              className={`${btnBase} ${active[command] ? btnActive : btnIdle}`}
            >
              <span className={className}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="rich-editor w-full text-sm text-gray-700 dark:text-gray-300 p-3 min-h-[100px] focus:outline-none"
      />
    </div>
  )
}
