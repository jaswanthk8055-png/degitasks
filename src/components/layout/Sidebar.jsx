import { useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/useAuthStore'
import { useBoardStore } from '../../stores/useBoardStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { supabase } from '../../lib/supabase'
import Avatar from '../ui/Avatar'
import Modal from '../ui/Modal'

const BOARD_ICONS = ['📋', '🚀', '⭐', '🎯', '💡', '🔥', '📊', '🛠️', '🎨', '📌']
const BOARD_COLORS = ['#0073ea', '#00c875', '#e2445c', '#fdab3d', '#9d50dd', '#00c2cd']

export default function Sidebar({ workspace, workspaceLoading = false, workspaceMembers = [], onMembersChange }) {
  const { boardId } = useParams()
  const location = useLocation()
  const { profile, signOut } = useAuthStore()
  const { boards, createBoard, updateBoard, deleteBoard } = useBoardStore()
  const { dark, toggle: toggleTheme } = useThemeStore()
  const navigate = useNavigate()

  const [newBoardModal, setNewBoardModal] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardIcon, setNewBoardIcon] = useState('📋')
  const [newBoardColor, setNewBoardColor] = useState('#0073ea')
  const [creating, setCreating] = useState(false)

  const [settingsBoard, setSettingsBoard] = useState(null)
  const [settingsName, setSettingsName] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [inviteModal, setInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState(null)
  const [inviteMsg, setInviteMsg] = useState('')
  const [inviting, setInviting] = useState(false)

  const handleCreateBoard = async (e) => {
    e.preventDefault()
    if (!newBoardName.trim() || !workspace) return
    setCreating(true)
    try {
      const board = await createBoard(workspace.id, profile.id, newBoardName.trim(), newBoardIcon, newBoardColor)
      setNewBoardModal(false)
      setNewBoardName('')
      setNewBoardIcon('📋')
      setNewBoardColor('#0073ea')
      navigate(`/board/${board.id}`)
    } finally {
      setCreating(false)
    }
  }

  const openBoardSettings = (e, board) => {
    e.preventDefault()
    e.stopPropagation()
    setSettingsBoard(board)
    setSettingsName(board.name)
    setConfirmDelete(false)
  }

  const handleSaveSettings = async () => {
    if (!settingsBoard) return
    setSavingSettings(true)
    try {
      await updateBoard(settingsBoard.id, { name: settingsName.trim() || settingsBoard.name })
      setSettingsBoard(null)
    } finally {
      setSavingSettings(false)
    }
  }

  const handleDeleteBoard = async () => {
    if (!settingsBoard) return
    setSavingSettings(true)
    try {
      await deleteBoard(settingsBoard.id)
      setSettingsBoard(null)
      if (boardId === settingsBoard.id) navigate('/')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!inviteEmail.trim() || !workspace) return
    setInviting(true)
    setInviteStatus(null)
    try {
      const { data, error } = await supabase.rpc('get_profile_by_email', {
        email_input: inviteEmail.trim().toLowerCase(),
      })
      if (error || !data || data.length === 0) {
        setInviteStatus('notfound')
        setInviteMsg('No account found with that email.')
      } else {
        const targetUser = data[0]
        if (workspaceMembers.some((m) => m.id === targetUser.id)) {
          setInviteStatus('error')
          setInviteMsg('This person is already a member.')
        } else {
          const { error: ie } = await supabase
            .from('workspace_members')
            .insert({ workspace_id: workspace.id, user_id: targetUser.id, role: 'member' })
          if (ie) {
            setInviteStatus('error')
            setInviteMsg('Failed to add member. Please try again.')
          } else {
            setInviteStatus('success')
            setInviteMsg(`${targetUser.full_name} has been added!`)
            setInviteEmail('')
            onMembersChange?.(workspace.id)
          }
        }
      }
    } finally {
      setInviting(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const visibleMembers = workspaceMembers.slice(0, 5)
  const extraCount = workspaceMembers.length > 5 ? workspaceMembers.length - 5 : 0
  const isDashboard = location.pathname === '/dashboard'
  const isInbox = location.pathname === '/inbox'

  return (
    <>
      <aside className="w-60 flex-shrink-0 bg-sidebar-bg flex flex-col h-full overflow-hidden">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-blue flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1.5" fill="white" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" fill="white" opacity="0.7" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" fill="white" opacity="0.7" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" fill="white" opacity="0.5" />
            </svg>
          </div>
          <span className="text-white font-bold text-base tracking-tight">DegiTasks</span>
        </div>

        {/* Workspace name */}
        {workspace && (
          <div className="px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-sidebar-hover rounded-lg mx-2 transition">
            <div className="w-5 h-5 rounded bg-primary-blue flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[9px] font-bold">{workspace.name.charAt(0).toUpperCase()}</span>
            </div>
            <span className="text-sidebar-text text-sm font-medium truncate flex-1">{workspace.name}</span>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-500 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        )}

        {/* Nav links */}
        <nav className="mt-3 px-2 space-y-0.5">
          <Link
            to="/dashboard"
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sidebar-text hover:bg-sidebar-hover transition text-sm ${
              isDashboard ? 'bg-blue-600/20 text-white' : ''
            }`}
          >
            <span className="text-gray-500"><DashboardIcon /></span>
            <span>Dashboard</span>
          </Link>
          <Link
            to="/inbox"
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sidebar-text hover:bg-sidebar-hover transition text-sm ${
              isInbox ? 'bg-blue-600/20 text-white' : ''
            }`}
          >
            <span className="text-gray-500"><InboxIcon /></span>
            <span>Activity log</span>
          </Link>
        </nav>

        <div className="mt-4 mx-2 h-px bg-gray-700" />

        {/* Boards header */}
        <div className="mt-4 px-4 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Boards</span>
          {workspaceLoading ? (
            <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin" />
          ) : (
            <button
              onClick={() => setNewBoardModal(true)}
              className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:bg-sidebar-hover hover:text-sidebar-text transition"
              title="New board"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </div>

        {/* Invite members */}
        {workspace && (
          <button
            onClick={() => { setInviteModal(true); setInviteStatus(null); setInviteEmail('') }}
            className="mx-3 mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-sidebar-hover hover:text-sidebar-text transition border border-dashed border-gray-700"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Invite members
          </button>
        )}

        {/* Board list */}
        <div className="mt-2 px-2 flex-1 overflow-y-auto scrollbar-thin space-y-0.5">
          {workspaceLoading ? (
            <p className="px-3 py-2 text-xs text-gray-500 italic">Setting up workspace…</p>
          ) : boards.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-600">No boards yet</p>
          ) : (
            boards.map((board) => (
              <div key={board.id} className="group/board relative">
                <Link
                  to={`/board/${board.id}`}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition pr-8 text-sm ${
                    boardId === board.id
                      ? 'bg-blue-600/20 text-white'
                      : 'text-sidebar-text hover:bg-sidebar-hover'
                  }`}
                >
                  <span className="flex-shrink-0" style={{ color: boardId === board.id ? undefined : board.color }}>
                    {board.icon || '📋'}
                  </span>
                  <span className="truncate">{board.name}</span>
                </Link>
                {/* "…" hover menu */}
                <button
                  onClick={(e) => openBoardSettings(e, board)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:bg-gray-700 hover:text-gray-300 opacity-0 group-hover/board:opacity-100 transition"
                  title="Board settings"
                >
                  <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="5" cy="12" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="19" cy="12" r="1.5" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Member avatars */}
        {workspaceMembers.length > 0 && (
          <div className="px-4 py-2 flex items-center gap-1">
            <div className="flex items-center -space-x-1.5">
              {visibleMembers.map((member) => (
                <div key={member.id} title={member.full_name}>
                  <Avatar name={member.full_name} color={member.avatar_color} size="xs" />
                </div>
              ))}
              {extraCount > 0 && (
                <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-[9px] text-gray-300 font-bold border border-sidebar-bg">
                  +{extraCount}
                </div>
              )}
            </div>
            <span className="text-xs text-gray-500 ml-1.5">
              {workspaceMembers.length} {workspaceMembers.length === 1 ? 'member' : 'members'}
            </span>
          </div>
        )}

        {/* User area + dark mode toggle */}
        <div className="border-t border-gray-700 p-3">
          <div className="flex items-center gap-2">
            <Avatar name={profile?.full_name} color={profile?.avatar_color} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sidebar-text text-sm font-medium truncate">{profile?.full_name}</p>
            </div>
            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="text-gray-500 hover:text-sidebar-text transition p-1 rounded"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
            {/* Sign out */}
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="text-gray-500 hover:text-sidebar-text transition p-1 rounded"
            >
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── New Board Modal ── */}
      <Modal open={newBoardModal} onClose={() => setNewBoardModal(false)} title="Create new board">
        <form onSubmit={handleCreateBoard} className="space-y-4">
          <input
            autoFocus
            type="text"
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            placeholder="Board name"
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent dark:bg-[#252525] dark:border-[#444] dark:text-white"
          />
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Icon</p>
            <div className="flex flex-wrap gap-2">
              {BOARD_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setNewBoardIcon(icon)}
                  className={`w-9 h-9 text-lg rounded-lg flex items-center justify-center transition ${
                    newBoardIcon === icon ? 'bg-blue-100 ring-2 ring-primary-blue' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Color</p>
            <div className="flex gap-2">
              {BOARD_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewBoardColor(color)}
                  className={`w-7 h-7 rounded-full transition ${
                    newBoardColor === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => setNewBoardModal(false)}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >Cancel</button>
            <button
              type="submit"
              disabled={creating || !newBoardName.trim()}
              className="px-4 py-2 text-sm text-white rounded-lg transition disabled:opacity-50"
              style={{ backgroundColor: newBoardColor }}
            >
              {creating ? 'Creating…' : 'Create board'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Board Settings Modal ── */}
      <Modal open={!!settingsBoard} onClose={() => setSettingsBoard(null)} title={`Board: ${settingsBoard?.name}`}>
        <div className="space-y-4">
          {!confirmDelete ? (
            <>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Board name</label>
                <input
                  autoFocus
                  type="text"
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSettings() }}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue dark:bg-[#252525] dark:border-[#444] dark:text-white"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <button onClick={() => setConfirmDelete(true)} className="text-sm text-red-500 hover:text-red-600 hover:underline transition">
                  Delete board
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setSettingsBoard(null)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition">Cancel</button>
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings || !settingsName.trim()}
                    className="px-4 py-2 text-sm text-white bg-primary-blue hover:bg-blue-600 rounded-lg transition disabled:opacity-50"
                  >
                    {savingSettings ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Delete <strong>{settingsBoard?.name}</strong>? All tasks and groups will be permanently removed.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition">Cancel</button>
                <button
                  onClick={handleDeleteBoard}
                  disabled={savingSettings}
                  className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition disabled:opacity-50"
                >
                  {savingSettings ? 'Deleting…' : 'Delete board'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Invite Members Modal ── */}
      <Modal
        open={inviteModal}
        onClose={() => { setInviteModal(false); setInviteStatus(null); setInviteEmail('') }}
        title="Invite member"
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Email address</label>
            <input
              autoFocus
              type="email"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteStatus(null) }}
              placeholder="colleague@company.com"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue dark:bg-[#252525] dark:border-[#444] dark:text-white"
            />
          </div>
          {inviteStatus && (
            <div className={`text-sm px-3 py-2.5 rounded-lg ${inviteStatus === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {inviteMsg}
            </div>
          )}
          {workspaceMembers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current members ({workspaceMembers.length})</p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-thin">
                {workspaceMembers.map((m) => (
                  <div key={m.id} className="flex items-center gap-2.5">
                    <Avatar name={m.full_name} color={m.avatar_color} size="sm" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{m.full_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setInviteModal(false); setInviteStatus(null); setInviteEmail('') }}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >Done</button>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="px-4 py-2 text-sm text-white bg-primary-blue hover:bg-blue-600 rounded-lg transition disabled:opacity-50"
            >
              {inviting ? 'Adding…' : 'Add member'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="5" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
    </svg>
  )
}
