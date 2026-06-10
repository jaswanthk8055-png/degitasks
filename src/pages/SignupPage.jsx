import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import SignupForm from '../components/auth/SignupForm'

export default function SignupPage() {
  const { user, loading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user) navigate('/')
  }, [user, loading, navigate])

  if (loading) return null

  return <SignupForm />
}
