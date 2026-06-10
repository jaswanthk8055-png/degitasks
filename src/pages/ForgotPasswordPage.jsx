import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'

export default function ForgotPasswordPage() {
  const sendPasswordResetEmail = useAuthStore((s) => s.sendPasswordResetEmail)
  const [email,   setEmail]   = useState('')
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await sendPasswordResetEmail(email)
      setSent(true)
    } catch (err) {
      setError(err.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          {/* Logo */}
          <div className="flex items-center justify-center mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary-blue flex items-center justify-center mr-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="7" height="7" rx="1.5" fill="white" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" fill="white" opacity="0.7" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" fill="white" opacity="0.7" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" fill="white" opacity="0.5" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-gray-900">DegiTasks</span>
          </div>

          {sent ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#00c875" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
              <p className="text-sm text-gray-500 mb-6">
                We sent a password reset link to <span className="font-medium text-gray-700">{email}</span>.
                Check your inbox and click the link to reset your password.
              </p>
              <Link to="/login" className="text-sm text-primary-blue font-medium hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-gray-900 text-center mb-1">Forgot your password?</h2>
              <p className="text-sm text-gray-500 text-center mb-6">
                Enter your email and we'll send you a reset link.
              </p>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="you@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-primary-blue text-white rounded-lg font-medium text-sm hover:bg-blue-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500">
                Remember your password?{' '}
                <Link to="/login" className="text-primary-blue font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
