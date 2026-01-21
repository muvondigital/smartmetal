/**
 * Demo Banner Component
 * 
 * Displays a persistent banner at the top of the page for demo tenants.
 * Only visible when tenant.is_demo is true.
 */

import { Alert, AlertDescription } from '../ui/alert'
import { Info } from 'lucide-react'

interface DemoBannerProps {
  isDemo: boolean
}

export default function DemoBanner({ isDemo }: DemoBannerProps) {
  if (!isDemo) {
    return null
  }

  return (
    <Alert variant="warning" className="rounded-none border-l-0 border-r-0 border-t-0 mb-0">
      <Info className="h-4 w-4" />
      <AlertDescription>
        <strong>Demo Account</strong> – Data shown here is for demonstration only and does not represent live production data.
      </AlertDescription>
    </Alert>
  )
}

