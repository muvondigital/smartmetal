/**
 * Protected Route Component
 * Guards routes that require authentication
 * Redirects to /login if user is not authenticated
 * 
 * Part of: Shared login portal (Mode A) - Multi-tenant authentication
 */

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const ENFORCE_ONBOARDING = import.meta.env.VITE_ENABLE_ONBOARDING_ENFORCEMENT === 'true'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, tenantOnboardingStatus } = useAuth()
  const location = useLocation()
  const onOnboardingRoute = location.pathname.startsWith('/onboarding')
  const shouldShowLoading =
    isLoading || (ENFORCE_ONBOARDING && isAuthenticated && !tenantOnboardingStatus)

  // Show loading state while checking auth
  if (shouldShowLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Development/demo bypass: ignore onboarding enforcement unless explicitly enabled
  if (!ENFORCE_ONBOARDING) {
    return <>{children}</>
  }

  // Redirect to onboarding wizard if not completed and not already on onboarding pages
  if (tenantOnboardingStatus?.status !== 'completed' && !onOnboardingRoute) {
    return <Navigate to="/onboarding" replace />
  }

  // Render protected content
  return <>{children}</>
}


