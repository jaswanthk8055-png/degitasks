import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import Avatar from '../components/ui/Avatar'

const AVATAR_COLORS = [
  '#0073ea', '#00c875', '#e2445c', '#fdab3d', '#9d50dd',
  '#00c2cd', '#037f4c', '#579bfc', '#ff642e', '#a25ddc',
  '#333333', '#808080', '#ffcb00', '#d83a52', '#7e5bd4',
]

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, profile, updateProfile, updatePassword } = useAuthStore()

  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [avatarColor, setAvatarColor] = useState(profile?.avatar_color || '#0073ea')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)

  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPasswordNote, setCurrentPasswordNote] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    if (!fullName.trim()) return
    setSaving(true)
    setSaveMsg(null)
    try {
      await updateProfile({ full_name: fullName.trim(), avatar_color: avatarColor })
      setSaveMsg({ type: 'success', text: 'Profile updated successfully.' })
    } catch {
      setSaveMsg({ type: 'error', text: 'Failed to save. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (!newPassword || newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: "Passwords don't match." })
      return
    }
    if (newPassword.length < 8) {
      setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' })
      return
    }
    setPwSaving(true)
    setPwMsg(null)
    try {
      await updatePassword(newPassword)
      setPwMsg({ type: 'success', text: 'Password changed successfully.' })
      setNewPassword('')
      setConfirmPassword('')
      setChangingPassword(false)
    } catch {
      setPwMsg({ type: 'error', text: 'Failed to change password. Please try again.' })
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#111] min-h-0">
      {/* Mobile back button / header */}
      <div className="sticky top-0 z-10 bg-gray-50 dark:bg-[#111] border-b border-gray-200 dark:border-[#2a2a2a] px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5"
          title="Go back"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-gray-900 dark:text-white">Profile Settings</h1>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">

        {/* Avatar + name preview */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-gray-200 dark:border-[#2a2a2a] p-6 flex flex-col sm:flex-row items-center gap-5">
          <div className="relative flex-shrink-0">
            <Avatar name={fullName || profile?.full_name} color={avatarColor} size="xl" />
          </div>
          <div className="text-center sm:text-left">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {fullName || profile?.full_name || 'Your Name'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
          </div>
        </div>

        {/* Profile form */}
        <form onSubmit={handleSaveProfile} className="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-gray-200 dark:border-[#2a2a2a] p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Personal Info</h2>

          {/* Full name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-[#444] text-sm text-gray-900 dark:text-white bg-white dark:bg-[#252525] focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent transition"
            />
          </div>

          {/* Email — read only */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={user?.email || ''}
              readOnly
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-[#444] text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-[#1a1a1a] cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Email cannot be changed.</p>
          </div>

          {/* Avatar color */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Avatar Color
            </label>
            <div className="flex flex-wrap gap-2.5">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAvatarColor(color)}
                  className={`w-8 h-8 rounded-full transition-all flex-shrink-0 ${
                    avatarColor === color
                      ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500 scale-110'
                      : 'hover:scale-110 hover:ring-2 hover:ring-offset-2 hover:ring-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>

          {saveMsg && (
            <div className={`text-sm px-3.5 py-2.5 rounded-xl ${
              saveMsg.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}>
              {saveMsg.text}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving || !fullName.trim()}
              className="px-5 py-2.5 bg-primary-blue text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition disabled:opacity-50 shadow-sm"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Password section */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-gray-200 dark:border-[#2a2a2a] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Password</h2>
            {!changingPassword && (
              <button
                onClick={() => { setChangingPassword(true); setPwMsg(null) }}
                className="text-sm text-primary-blue hover:text-blue-600 transition font-medium"
              >
                Change password
              </button>
            )}
          </div>

          {!changingPassword ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">••••••••••••</p>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-[#444] text-sm text-gray-900 dark:text-white bg-white dark:bg-[#252525] focus:outline-none focus:ring-2 focus:ring-primary-blue transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-[#444] text-sm text-gray-900 dark:text-white bg-white dark:bg-[#252525] focus:outline-none focus:ring-2 focus:ring-primary-blue transition"
                />
              </div>

              {pwMsg && (
                <div className={`text-sm px-3.5 py-2.5 rounded-xl ${
                  pwMsg.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                }`}>
                  {pwMsg.text}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setChangingPassword(false); setNewPassword(''); setConfirmPassword(''); setPwMsg(null) }}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwSaving || !newPassword || !confirmPassword}
                  className="px-5 py-2 bg-primary-blue text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition disabled:opacity-50"
                >
                  {pwSaving ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Danger zone */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl border border-red-100 dark:border-red-900/30 p-6">
          <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-2">Account</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Signed in as <strong className="text-gray-700 dark:text-gray-200">{user?.email}</strong>
          </p>
          <SignOutButton />
        </div>

      </div>
    </div>
  )
}

function SignOutButton() {
  const { signOut } = useAuthStore()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition font-medium"
    >
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
      Sign out
    </button>
  )
}
