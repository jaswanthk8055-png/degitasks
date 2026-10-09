import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import LoginForm from '../components/auth/LoginForm'
import { loginDestination } from '../lib/authRedirect'

export default function LoginPage() {
  const { user, loading } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const destination = loginDestination(location)

  useEffect(() => {
    if (!loading && user) navigate(destination, { replace: true })
  }, [user, loading, navigate, destination])

  if (loading) return null

  return <LoginForm />
}
