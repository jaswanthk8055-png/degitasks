// Isolated visual fixture: real menu/styles, no Supabase or task data.
import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Dropdown from '../src/components/ui/Dropdown'
import '../src/index.css'

function DropdownDemo() {
  const anchor = useRef(null)
  const [open, setOpen] = useState(false)
  const [longMenu, setLongMenu] = useState(false)
  const [selected, setSelected] = useState('Not Started')
  const options = longMenu
    ? Array.from({ length: 40 }, (_, i) => `Status ${i + 1}`)
    : ['Not Started', 'Working on it', 'Done', 'Stuck', 'In Review', 'Manage statuses']
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Dropdown viewport check</h1>
      <p className="my-3">Selected: {selected}</p>
      <label><input type="checkbox" checked={longMenu} onChange={(event) => setLongMenu(event.target.checked)} /> Test 40 options</label>
      <div style={{ position: 'fixed', bottom: 12, right: 12, width: 192 }}>
        <button ref={anchor} onClick={() => setOpen(!open)} style={{ background: '#6b7280', color: '#fff' }} className="w-full p-2 rounded">Open status menu</button>
        <Dropdown open={open} onClose={() => setOpen(false)} anchorRef={anchor} className="w-48">
          {options.map((option) => (
            <button key={option} className="block w-full px-3 py-2 text-left hover:bg-gray-100" onClick={() => { setSelected(option); setOpen(false) }}>{option}</button>
          ))}
        </Dropdown>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<DropdownDemo />)
