import { useToastStore } from '../../stores/useToastStore'

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()
  if (!toasts.length) return null

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl text-sm font-medium text-white min-w-[240px] max-w-[360px] animate-toast-in ${
            toast.type === 'error'
              ? 'bg-status-red'
              : toast.type === 'info'
              ? 'bg-primary-blue'
              : 'bg-status-green'
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-white/70 hover:text-white transition flex-shrink-0"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
