/**
 * Protected Layout Component
 * Combines ProtectedRoute and AppShell for authenticated pages
 */

import ProtectedRoute from './ProtectedRoute'
import AppShell from './layout/AppShell'
import BRANDING from '../config/branding'

interface ProtectedLayoutProps {
  children: React.ReactNode
  title?: string
}

export default function ProtectedLayout({ children, title = BRANDING.APP_TITLE }: ProtectedLayoutProps) {
  return (
    <ProtectedRoute>
      <AppShell title={title}>
        {children}
      </AppShell>
    </ProtectedRoute>
  )
}




