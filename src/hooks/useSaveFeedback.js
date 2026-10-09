import { useCallback, useRef, useState } from 'react'
import { useToastStore } from '../stores/useToastStore'

// Keep edits from one editor in order and announce only confirmed persistence.
export function useSaveFeedback() {
  const [feedback, setFeedback] = useState({ state: 'idle', message: '' })
  const queue = useRef(Promise.resolve())
  const pending = useRef(0)
  const failure = useRef('')

  const save = useCallback((operation) => {
    const idle = pending.current === 0
    if (idle) failure.current = ''
    pending.current += 1
    setFeedback({ state: 'saving', message: 'Saving…' })
    const run = async () => {
      try {
        await operation()
        return true
      } catch (error) {
        failure.current = error.message || 'Could not save. Please try again.'
        useToastStore.getState().addToast(failure.current, 'error')
        return false
      } finally {
        pending.current -= 1
        if (pending.current === 0) {
          setFeedback(failure.current
            ? { state: 'error', message: failure.current }
            : { state: 'saved', message: 'Saved' })
        }
      }
    }
    const result = idle ? run() : queue.current.then(run)
    queue.current = result
    return result
  }, [])

  return { ...feedback, save }
}
