import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import LoginForm from '../components/auth/LoginForm'

export default function LoginPage() {
  const { user, loading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user) navigate('/')
  }, [user, loading, navigate])

  if (loading) return null

  return <LoginForm />
}
