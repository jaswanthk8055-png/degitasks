import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import Avatar from '../components/ui/Avatar'

const ACTION_LABELS = {
  task_created: (meta) => `created task "${meta.task_title || 'Untitled'}"`,
  status_changed: (meta) => `changed status of "${meta.task_title || 'a task'}" to ${meta.new_status || 'a new status'}`,
  task_assigned: (meta) => `assigned "${meta.task_title || 'a task'}" to ${meta.assignee_name || 'someone'}`,
  comment_added: (meta) => `commented on "${meta.task_title || 'a task'}"`,
}

export default function InboxPage() {
  const { workspace } = useOutletContext()
  const [activities, setActivities] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!workspace?.id) {
      setLoading(false)
      return
    }
    fetchActivities()
    fetchProfiles()
  }, [workspace?.id])

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*')
    if (data) setProfiles(data)
  }

  const fetchActivities = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setActivities(data || [])
    setLoading(false)
  }

  const grouped = groupByDate(activities)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="h-14 bg-white border-b border-border-color flex items-center px-6 gap-3 flex-shrink-0">
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} className="text-gray-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <h1 className="text-lg font-semibold text-gray-900">Inbox</h1>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} className="mb-4 opacity-40">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs mt-1">Actions on tasks will appear here</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-6 py-6">
            {grouped.map(({ label, items }) => (
              <div key={label} className="mb-8">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-4">
                  {label}
                </h2>
                <div className="bg-white rounded-xl border border-border-color overflow-hidden">
                  {items.map((activity, idx) => {
                    const actor = profiles.find((p) => p.id === activity.user_id)
                    const actionText = ACTION_LABELS[activity.action]?.(activity.meta || {}) || activity.action
                    return (
                      <div
                        key={activity.id}
                        className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
                          idx < items.length - 1 ? 'border-b border-border-color' : ''
                        }`}
                      >
                        <Avatar
                          name={actor?.full_name || '?'}
                          color={actor?.avatar_color || '#c4c4c4'}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 leading-snug">
                            <span className="font-semibold">{actor?.full_name || 'Someone'}</span>
                            {' '}
                            <span>{actionText}</span>
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {format(parseISO(activity.created_at), 'h:mm a')}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function groupByDate(activities) {
  const result = []
  const todayItems = activities.filter((a) => isToday(parseISO(a.created_at)))
  const yesterdayItems = activities.filter((a) => isYesterday(parseISO(a.created_at)))
  const earlierItems = activities.filter(
    (a) => !isToday(parseISO(a.created_at)) && !isYesterday(parseISO(a.created_at))
  )
  if (todayItems.length) result.push({ label: 'Today', items: todayItems })
  if (yesterdayItems.length) result.push({ label: 'Yesterday', items: yesterdayItems })
  if (earlierItems.length) result.push({ label: 'Earlier', items: earlierItems })
  return result
}
