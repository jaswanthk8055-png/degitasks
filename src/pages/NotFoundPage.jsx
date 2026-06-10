import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-200">404</h1>
        <p className="mt-4 text-lg text-gray-600 font-medium">Page not found</p>
        <p className="mt-1 text-sm text-gray-400">The page you're looking for doesn't exist.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-primary-blue text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition"
        >
          ← Back to home
        </Link>
      </div>
    </div>
  )
}
