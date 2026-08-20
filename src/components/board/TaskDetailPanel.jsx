import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuthStore, SUPER_USER_EMAIL } from '../../stores/useAuthStore'
import { useBoardStore } from '../../stores/useBoardStore'
import StatusPill from './StatusPill'
import AssigneePicker from './AssigneePicker'
import DatePicker from './DatePicker'
import PriorityPill from './PriorityPill'
import Avatar from '../ui/Avatar'
import RichTextEditor from '../ui/RichTextEditor'

export default function TaskDetailPanel({ task, onClose, onUpdate }) {
  const { profile, user } = useAuthStore()
  const { profiles, memberProfiles, currentBoard, workspaceId, logActivity } = useBoardStore()
  const canEdit = user?.email === SUPER_USER_EMAIL

  const [description, setDescription] = useState(task?.description || '')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task?.title || '')
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const commentsEndRef = useRef(null)
  const panelRef = useRef(null)
  const descSaveTimer = useRef(null)

  // Sync local state when task changes
  useEffect(() => {
    if (task) {
      setTitleValue(task.title || '')
      setDescription(task.description || '')
      fetchComments(task.id)
    }
  }, [task?.id])

  // Realtime comments subscription
  useEffect(() => {
    if (!task) return
    const channel = supabase
      .channel(`task-comments:${task.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `task_id=eq.${task.id}` },
        (payload) => {
          const commenter = profiles.find((p) => p.id === payload.new.user_id) || {
            full_name: 'Unknown',
            avatar_color: '#c4c4c4',
          }
          const enriched = { ...payload.new, profile: commenter }
          setComments((prev) => {
            const exists = prev.some((c) => c.id === enriched.id)
            return exists ? prev : [...prev, enriched]
          })
          setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [task?.id, profiles])

  // Click-outside to close
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose()
      }
    }
    // Delay so the click that opens the panel doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  // Escape key to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const fetchComments = async (taskId) => {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at')
    if (data) {
      const enriched = data.map((c) => ({
        ...c,
        profile: profiles.find((p) => p.id === c.user_id) || { full_name: 'Unknown', avatar_color: '#c4c4c4' },
      }))
      setComments(enriched)
    }
  }

  const commitTitle = () => {
    setEditingTitle(false)
    if (titleValue.trim() && titleValue.trim() !== task.title) {
      onUpdate(task.id, { title: titleValue.trim() })
    } else {
      setTitleValue(task.title || '')
    }
  }

  const handleDescriptionChange = (val) => {
    setDescription(val)
    clearTimeout(descSaveTimer.current)
    descSaveTimer.current = setTimeout(() => {
      onUpdate(task.id, { description: val })
    }, 800)
  }

  const submitComment = async () => {
    if (!commentText.trim() || !profile) return
    setSubmitting(true)
    try {
      await supabase.from('comments').insert({
        task_id: task.id,
        user_id: profile.id,
        body: commentText.trim(),
      })
      setCommentText('')

      // Log activity
      logActivity({
        taskId: task.id,
        userId: profile.id,
        action: 'comment_added',
        meta: { comment_preview: commentText.trim().slice(0, 60) },
      })

      // Notify task creator if they're a different user
      if (task.created_by && task.created_by !== profile.id) {
        await supabase.from('notifications').insert({
          user_id: task.created_by,
          message: `${profile.full_name} commented on "${task.title || 'a task'}"`,
          task_id: task.id,
          read: false,
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!task) return null

  return (
    <div
      ref={panelRef}
      className="fixed right-0 top-0 h-full w-[420px] bg-white border-l border-border-color shadow-2xl z-40 flex flex-col overflow-hidden animate-slide-in"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-color flex-shrink-0">
        <span className="text-sm font-medium text-gray-500">Task Details</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition p-1 rounded-lg hover:bg-gray-100"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Title */}
        <div className="px-5 pt-5 pb-3">
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') { setTitleValue(task.title || ''); setEditingTitle(false) }
              }}
              className="text-2xl font-bold text-gray-900 w-full border-b-2 border-primary-blue outline-none bg-transparent leading-tight"
            />
          ) : (
            <h2
              onClick={() => setEditingTitle(true)}
              className="text-2xl font-bold text-gray-900 cursor-text hover:text-primary-blue transition leading-tight break-words"
            >
              {task.title || <span className="text-gray-400 italic font-normal text-lg">Untitled task</span>}
            </h2>
          )}
        </div>

        {/* Fields */}
        <div className="px-5 pb-4 space-y-3 border-b border-border-color">
          <FieldRow label="Status">
            <StatusPill
              status={task.status}
              statusColor={task.status_color}
              taskId={task.id}
              onUpdate={onUpdate}
            />
          </FieldRow>
          <FieldRow label="Assignee">
            <AssigneePicker
              assigneeIds={task.assignee_ids ?? (task.assignee_id ? [task.assignee_id] : [])}
              profiles={profiles}
              assignableProfiles={memberProfiles}
              taskId={task.id}
              onUpdate={onUpdate}
            />
          </FieldRow>
          <FieldRow label="Due Date">
            <DatePicker
              dueDate={task.due_date}
              taskId={task.id}
              onUpdate={onUpdate}
            />
          </FieldRow>
          <FieldRow label="Priority">
            <PriorityPill
              priority={task.priority}
              taskId={task.id}
              onUpdate={onUpdate}
            />
          </FieldRow>
        </div>

        {/* Description */}
        <div className="px-5 py-4 border-b border-border-color">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Description</h3>
          <RichTextEditor
            value={description}
            onChange={handleDescriptionChange}
            placeholder="Add a description..."
          />
        </div>

        {/* Updates / Comments */}
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Updates</h3>

          {/* Comment input */}
          <div className="flex gap-2.5 mb-5">
            <Avatar name={profile?.full_name} color={profile?.avatar_color} size="sm" />
            <div className="flex-1">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write an update..."
                className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent resize-none placeholder-gray-400"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment()
                }}
              />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-gray-400">Ctrl+Enter to post</span>
                <button
                  onClick={submitComment}
                  disabled={submitting || !commentText.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-primary-blue text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
                >
                  {submitting ? 'Posting…' : 'Post update'}
                </button>
              </div>
            </div>
          </div>

          {/* Comment list */}
          {comments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No updates yet</p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2.5">
                  <Avatar
                    name={comment.profile?.full_name}
                    color={comment.profile?.avatar_color}
                    size="sm"
                  />
                  <div className="flex-1 bg-gray-50 rounded-lg p-3 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-800 truncate">
                        {comment.profile?.full_name}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {format(parseISO(comment.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{comment.body}</p>
                  </div>
                </div>
              ))}
              <div ref={commentsEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FieldRow({ label, children }) {
  return (
    <div className="flex items-center gap-3 min-h-[32px]">
      <span className="text-sm text-gray-500 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 flex items-center">{children}</div>
    </div>
  )
}
