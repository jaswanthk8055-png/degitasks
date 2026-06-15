import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBoardStore } from '../stores/useBoardStore'
import { useAuthStore } from '../stores/useAuthStore'

export default function HomePage() {
  const boards = useBoardStore((s) => s.boards)
  const profile = useAuthStore((s) => s.profile)
  const navigate = useNavigate()

  useEffect(() => {
    if (boards.length > 0) {
      const defaultView = profile?.default_page || 'Main Table'
      navigate(`/board/${boards[0].id}`, { replace: true, state: { defaultView } })
    }
  }, [boards, profile, navigate])

  return (
    <div className="flex-1 flex items-center justify-center">
      {boards.length === 0 ? (
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#0073ea" strokeWidth={1.5}>
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Welcome to DegiTasks</h3>
          <p className="text-sm text-gray-500 mb-5">
            Create your first board using the sidebar to start organizing your work.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-gray-400">
          <div className="w-5 h-5 border-2 border-primary-blue border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Redirecting to board…</span>
        </div>
      )}
    </div>
  )
}
