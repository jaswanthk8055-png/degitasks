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
      <Sidebar
        workspace={workspace}
        workspaceLoading={workspaceLoading}
        workspaceMembers={workspaceMembers}
        onMembersChange={fetchWorkspaceMembers}
        onOpenSearch={() => setPaletteOpen(true)}
      />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-[#1a1a1a]">
        <Outlet context={{ workspace, workspaceMembers }} />
      </main>

      {/* Global overlays */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ToastContainer />
    </div>
  )
}
