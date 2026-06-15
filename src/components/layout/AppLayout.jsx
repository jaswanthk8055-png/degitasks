import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/useAuthStore'
import { useBoardStore } from '../../stores/useBoardStore'
import { supabase } from '../../lib/supabase'
import Sidebar from './Sidebar'
import ToastContainer from '../ui/Toast'
import CommandPalette from '../ui/CommandPalette'

export default function AppLayout() {
  const { user, profile, loading } = useAuthStore()
  const { fetchBoards, createBoard } = useBoardStore()
  const navigate = useNavigate()
  const [workspace, setWorkspace] = useState(null)
  const [workspaceMembers, setWorkspaceMembers] = useState([])
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const isTeamsMode = new URLSearchParams(window.location.search).get('teams') === 'true'

  // Global Cmd+K / Ctrl+K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!loading && !user) navigate('/login')
  }, [user, loading, navigate])

  useEffect(() => {
    if (!user) return
    fetchWorkspace()
  }, [user])

  const activateWorkspace = (ws) => {
    setWorkspace(ws)
    fetchBoards(ws.id)
    fetchWorkspaceMembers(ws.id)
  }

  const fetchWorkspace = async () => {
    setWorkspaceLoading(true)
    try {
      const { data, error: fetchErr } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at')
        .limit(1)
        .maybeSingle()

      if (fetchErr) console.error('[workspace] fetch error:', fetchErr)

      if (data) {
        activateWorkspace(data)
        return
      }

      const displayName = profile?.full_name || user.email?.split('@')[0] || 'My'
      const { data: newWs, error: createErr } = await supabase
        .from('workspaces')
        .insert({ name: `${displayName}'s Workspace`, owner_id: user.id })
        .select()
        .single()

      if (createErr) { console.error('[workspace] create error:', createErr); return }

      await supabase
        .from('workspace_members')
        .insert({ workspace_id: newWs.id, user_id: user.id, role: 'owner' })
      await createBoard(newWs.id, user.id, 'My First Board')
      activateWorkspace(newWs)
    } finally {
      setWorkspaceLoading(false)
    }
  }

  const fetchWorkspaceMembers = async (workspaceId) => {
    const { data } = await supabase
      .from('workspace_members')
      .select('user_id, profiles(*)')
      .eq('workspace_id', workspaceId)
    if (data) {
      setWorkspaceMembers(data.map((m) => m.profiles).filter(Boolean))
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-[#111]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-primary-blue border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading DegiTasks…</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Mobile overlay backdrop */}
      {!isTeamsMode && mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {!isTeamsMode && (
        <Sidebar
          workspace={workspace}
          workspaceLoading={workspaceLoading}
          workspaceMembers={workspaceMembers}
          onMembersChange={fetchWorkspaceMembers}
          onOpenSearch={() => setPaletteOpen(true)}
          mobileSidebarOpen={mobileSidebarOpen}
          onCloseMobileSidebar={() => setMobileSidebarOpen(false)}
        />
      )}

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-[#1a1a1a]">
        {/* Mobile top bar — hidden in Teams mode */}
        {!isTeamsMode && (
          <div className="md:hidden flex items-center gap-2 px-4 h-12 bg-sidebar-bg border-b border-gray-700 flex-shrink-0">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="text-gray-400 hover:text-white transition p-1.5 rounded-lg"
              title="Open menu"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary-blue flex items-center justify-center">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" fill="white" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" fill="white" opacity="0.7" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" fill="white" opacity="0.7" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" fill="white" opacity="0.5" />
                </svg>
              </div>
              <span className="text-white font-bold text-sm">DegiTasks</span>
            </div>
          </div>
        )}

        {/* Teams mode: open-in-browser link */}
        {isTeamsMode && (
          <div className="flex justify-end px-4 py-2 flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
            <a
              href={window.location.pathname}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-primary-blue transition flex items-center gap-1"
            >
              Open in browser
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        <Outlet context={{ workspace, workspaceMembers }} />
      </main>

      {/* Global overlays */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ToastContainer />
    </div>
  )
}
