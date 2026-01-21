import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { firstOnboardingStepPath, onboardingSteps } from './steps'

export default function OnboardingWelcome() {
  const { tenantOnboardingStatus } = useAuth()
  const navigate = useNavigate()

  const resumePath = useMemo(() => {
    if (!tenantOnboardingStatus) return firstOnboardingStepPath
    if (tenantOnboardingStatus.currentStep) {
      const current = onboardingSteps.find((s) => s.key === tenantOnboardingStatus.currentStep)
      if (current) return current.path
    }
    return firstOnboardingStepPath
  }, [tenantOnboardingStatus])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-blue-600 font-semibold">Welcome</p>
        <h2 className="text-2xl font-semibold text-gray-900 mt-1">SmartMetal Tenant Onboarding</h2>
        <p className="text-gray-600 mt-3">
          We will guide you through the required steps to configure your tenant. You can resume at any time.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {onboardingSteps.map((step, idx) => (
          <div key={step.key} className="border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{`Step ${idx + 1}`}</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{step.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-3 sm:space-y-0">
        <button
          onClick={() => navigate(resumePath)}
          className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700"
        >
          {tenantOnboardingStatus?.status === 'in_progress' ? 'Resume onboarding' : 'Get started'}
        </button>
        <p className="text-sm text-gray-500">
          {tenantOnboardingStatus?.status === 'in_progress'
            ? 'Pick up where you left off.'
            : 'Begin with company profile.'}
        </p>
      </div>
    </div>
  )
}
