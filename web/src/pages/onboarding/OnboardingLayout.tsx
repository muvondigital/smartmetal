import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { onboardingSteps } from './steps'

export default function OnboardingLayout() {
  const { isAuthenticated, isLoading, tenantOnboardingStatus } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (isLoading || !tenantOnboardingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mx-auto" />
          <p className="mt-4 text-sm text-gray-600">Loading onboarding...</p>
        </div>
      </div>
    )
  }

  const currentPath = location.pathname
  const activeIndex = onboardingSteps.findIndex((step) => currentPath.startsWith(step.path))
  const completed = new Set(tenantOnboardingStatus.completedSteps || [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-sm text-gray-500 uppercase tracking-wide">Tenant Onboarding</p>
            <h1 className="text-2xl font-semibold text-gray-900">Complete setup to access the app</h1>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Exit to Dashboard
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1 bg-white rounded-lg shadow-sm border border-gray-100">
            <div className="p-4 border-b border-gray-100">
              <p className="text-sm text-gray-600">
                Status:{' '}
                <span className="font-semibold capitalize">{tenantOnboardingStatus.status.replace('_', ' ')}</span>
              </p>
            </div>
            <ol className="divide-y divide-gray-100">
              {onboardingSteps.map((step, index) => {
                const isActive = index === activeIndex
                const isCompleted = completed.has(step.key)
                return (
                  <li
                    key={step.key}
                    className={`flex items-center justify-between px-4 py-3 ${
                      isActive ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{step.label}</p>
                      <p className="text-xs text-gray-500">{`Step ${index + 1} of ${onboardingSteps.length}`}</p>
                    </div>
                    {isCompleted ? (
                      <span className="text-green-600 text-sm font-semibold">✓</span>
                    ) : (
                      <span className="text-gray-400 text-xs">Pending</span>
                    )}
                  </li>
                )
              })}
            </ol>
          </aside>

          <main className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
