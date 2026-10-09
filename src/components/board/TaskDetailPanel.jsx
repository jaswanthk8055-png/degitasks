import { useState, useEffect, useRef, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import { useBoardStore } from '../../stores/useBoardStore'
import StatusPill from './StatusPill'
import AssigneePicker from './AssigneePicker'
import DatePicker from './DatePicker'
import PriorityPill from './PriorityPill'
import TaskProjectPicker from './TaskProjectPicker'
import Avatar from '../ui/Avatar'
import RichTextEditor from '../ui/RichTextEditor'
import { useSaveFeedback } from '../../hooks/useSaveFeedback'
import { useToastStore } from '../../stores/useToastStore'
import { taskPath } from '../../lib/taskLinks'

export default function TaskDetailPanel({ task, onClose, onUpdate }) {
  const { profile } = useAuthStore()
  const { profiles, memberProfiles, logActivity } = useBoardStore()
  const taskId = task?.id

  const [descriptionDraft, setDescriptionDraft] = useState(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [savingTitle, setSavingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task?.title || '')
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [commentError, setCommentError] = useState('')
  const commentsEndRef = useRef(null)
  const panelRef = useRef(null)
  const descSaveTimer = useRef(null)
  const pendingDescription = useRef(null)
  const titlePending = useRef(false)
  const titleCancelled = useRef(false)
  const commentPending = useRef(false)
  const titleButtonRef = useRef(null)
  const restoreTitleFocus = useRef(false)
  const feedback = useSaveFeedback()
  const { save } = feedback
  const handleUpdate = (id, updates) => save(() => onUpdate(id, updates))

  const saveDescription = useCallback((value) => {
    return save(() => onUpdate(taskId, { description: value })).then((saved) => {
      if (saved) setDescriptionDraft((draft) => draft === value ? null : draft)
      return saved
    })
  }, [onUpdate, save, taskId])

  // Closing or navigating away must not discard the last debounce interval.
  useEffect(() => () => {
    clearTimeout(descSaveTimer.current)
    if (pendingDescription.current !== null) {
      const value = pendingDescription.current
      pendingDescription.current = null
      saveDescription(value)
    }
  }, [saveDescription])

  // This panel is nonmodal: leave the board reachable and return focus only
  // when it was still in the panel when the panel closed.
  useEffect(() => {
    const opener = document.activeElement
    const panel = panelRef.current
    panel?.focus()
    return () => {
      if ((panel?.contains(document.activeElement) || document.activeElement === document.body)
        && opener?.isConnected) opener.focus()
    }
  }, [taskId])

  // The parent keys this panel by task ID so drafts reset when another task opens.
  useEffect(() => {
    if (!taskId) return
    let cancelled = false
    const fetchComments = async () => {
      const { data } = await supabase
        .from('comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at')
      if (data && !cancelled) {
        setComments(data.map((c) => ({
          ...c,
          profile: profiles.find((p) => p.id === c.user_id) || { full_name: 'Unknown', avatar_color: '#c4c4c4' },
        })))
      }
    }
    fetchComments()
    return () => { cancelled = true }
  }, [taskId, profiles])

  // Realtime comments subscription
  useEffect(() => {
    if (!taskId) return
    const channel = supabase
      .channel(`task-comments:${taskId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `task_id=eq.${taskId}` },
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
  }, [taskId, profiles])

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
    const handler = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !e.target.closest?.('[aria-modal="true"]')) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const commitTitle = async () => {
    if (titlePending.current || titleCancelled.current) return
    if (titleValue.trim() && titleValue.trim() !== task.title) {
      titlePending.current = true
      setSavingTitle(true)
      const saved = await handleUpdate(task.id, { title: titleValue.trim() })
      titlePending.current = false
      setSavingTitle(false)
      if (!saved) return
    } else {
      setTitleValue(task.title || '')
    }
    setEditingTitle(false)
    if (restoreTitleFocus.current) requestAnimationFrame(() => titleButtonRef.current?.focus())
    restoreTitleFocus.current = false
  }

  const handleDescriptionChange = (val) => {
    setDescriptionDraft(val)
    pendingDescription.current = val
    clearTimeout(descSaveTimer.current)
    descSaveTimer.current = setTimeout(() => {
      pendingDescription.current = null
      saveDescription(val)
    }, 800)
  }

  const copyTaskLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(taskPath(task), window.location.origin).href)
      useToastStore.getState().addToast('Task link copied')
    } catch {
      useToastStore.getState().addToast('Could not copy the link. Copy this page’s address from your browser.', 'error')
    }
  }

  const submitComment = async () => {
    if (!commentText.trim() || !profile || commentPending.current) return
    commentPending.current = true
    setSubmitting(true)
    setCommentError('')
    try {
      const { data, error } = await supabase.from('comments').insert({
        task_id: task.id,
        user_id: profile.id,
        body: commentText.trim(),
      }).select().single()
      if (error) throw error
      if (!data) throw new Error('The update could not be posted. Please try again.')
      setComments((previous) => previous.some((comment) => comment.id === data.id)
        ? previous : [...previous, { ...data, profile }])
      setCommentText('')
      useToastStore.getState().addToast('Update posted')

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
    } catch (error) {
      setCommentError(error.message || 'Could not post update. Please try again.')
    } finally {
      commentPending.current = false
      setSubmitting(false)
    }
  }

  if (!task) return null

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Task details: ${task.title || 'Untitled task'}`}
      tabIndex={-1}
      data-task-id={task.id}
      data-save-state={descriptionDraft !== null && !['saving', 'error'].includes(feedback.state) ? 'unsaved' : feedback.state}
      className="fixed right-0 top-0 h-full w-[420px] max-w-full bg-white border-l border-border-color shadow-2xl z-40 flex flex-col overflow-hidden animate-slide-in focus:outline-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-color flex-shrink-0">
        <span className="text-sm font-medium text-gray-500">Task Details</span>
        <button type="button" onClick={copyTaskLink}
          className="ml-auto mr-3 text-xs text-primary-blue rounded focus-visible:ring-2 focus-visible:ring-primary-blue">Copy task link</button>
        <button
          onClick={onClose}
          aria-label="Close task details"
          className="text-gray-400 hover:text-gray-600 transition p-1 rounded-lg hover:bg-gray-100"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-5 pt-2 text-xs" role="status" aria-live="polite" aria-atomic="true">
          <span className={feedback.state === 'error' ? 'text-red-600' : 'text-gray-500'}>
            {feedback.state === 'error' ? `Save failed: ${feedback.message}`
              : descriptionDraft !== null && feedback.state !== 'saving' ? 'Unsaved description changes' : feedback.message}
          </span>
          {feedback.state === 'error' && descriptionDraft !== null && (
            <button type="button" className="ml-2 underline text-primary-blue" onClick={() => {
              clearTimeout(descSaveTimer.current)
              pendingDescription.current = null
              saveDescription(descriptionDraft)
            }}>Retry saving description</button>
          )}
        </div>
        {/* Title */}
        <div className="px-5 pt-5 pb-3">
          {editingTitle ? (
            <input
              autoFocus
              aria-label="Task name"
              data-field="title"
              readOnly={savingTitle}
              aria-busy={savingTitle}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); restoreTitleFocus.current = true; commitTitle() }
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  titleCancelled.current = true
                  setTitleValue(task.title || '')
                  setEditingTitle(false)
                  requestAnimationFrame(() => titleButtonRef.current?.focus())
                }
              }}
              className="text-2xl font-bold text-gray-900 w-full border-b-2 border-primary-blue outline-none bg-transparent leading-tight"
            />
          ) : (
            <h2
              className="text-2xl font-bold text-gray-900 cursor-text hover:text-primary-blue transition leading-tight break-words"
            >
              <button type="button" ref={titleButtonRef} aria-label={`Edit task name: ${task.title || 'Untitled task'}`}
                className="text-left w-full rounded focus-visible:ring-2 focus-visible:ring-primary-blue"
                onClick={() => { titleCancelled.current = false; setTitleValue(task.title || ''); setEditingTitle(true) }}>
              {task.title || <span className="text-gray-400 italic font-normal text-lg">Untitled task</span>}
              </button>
            </h2>
          )}
        </div>

        {/* Fields */}
        <div className="px-5 pb-4 space-y-3 border-b border-border-color">
          <FieldRow label="Project">
            <TaskProjectPicker task={task} />
          </FieldRow>
          <FieldRow label="Status">
            <StatusPill
              status={task.status}
              statusColor={task.status_color}
              taskId={task.id}
              taskTitle={task.title || 'Untitled task'}
              onUpdate={handleUpdate}
            />
          </FieldRow>
          <FieldRow label="Assignee">
            <AssigneePicker
              assigneeIds={task.assignee_ids ?? (task.assignee_id ? [task.assignee_id] : [])}
              profiles={profiles}
              assignableProfiles={memberProfiles}
              taskId={task.id}
              taskTitle={task.title || 'Untitled task'}
              onUpdate={handleUpdate}
            />
          </FieldRow>
          <FieldRow label="Due Date">
            <DatePicker
              dueDate={task.due_date}
              taskId={task.id}
              taskTitle={task.title || 'Untitled task'}
              onUpdate={handleUpdate}
            />
          </FieldRow>
          <FieldRow label="Priority">
            <PriorityPill
              priority={task.priority}
              taskId={task.id}
              taskTitle={task.title || 'Untitled task'}
              onUpdate={handleUpdate}
            />
          </FieldRow>
        </div>

        {/* Description */}
        <div className="px-5 py-4 border-b border-border-color">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Description</h3>
          <RichTextEditor
            value={descriptionDraft ?? task.description ?? ''}
            onChange={handleDescriptionChange}
            placeholder="Add a description..."
            label={`Description for "${task.title || 'Untitled task'}"`}
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
                aria-label={`Write an update for "${task.title || 'Untitled task'}"`}
                disabled={submitting}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write an update..."
                className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent resize-none placeholder-gray-400"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitComment() }
                }}
              />
              {commentError && <p role="alert" className="text-xs text-red-600 mt-1">{commentError}</p>}
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
