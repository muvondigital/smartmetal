import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { completeOnboarding } from '../../services/onboardingApi'
import { useAuth } from '../../contexts/AuthContext'
import { onboardingSteps } from './steps'
import { useOnboardingAnalytics } from './useOnboardingAnalytics'

export default function ReviewStep() {
  const navigate = useNavigate()
  const { tenantOnboardingStatus, setTenantOnboardingStatus } = useAuth()
  const [isCompleting, setIsCompleting] = useState(false)
  const { trackStepCompleted } = useOnboardingAnalytics('review')

  const completedSet = useMemo(
    () => new Set(tenantOnboardingStatus?.completedSteps || []),
    [tenantOnboardingStatus]
  )

  const handleComplete = async () => {
    setIsCompleting(true)
    try {
      const status = await completeOnboarding()
      setTenantOnboardingStatus(status)
      trackStepCompleted()
      navigate('/dashboard')
    } catch (error) {
      console.error('Failed to complete onboarding', error)
    } finally {
      setIsCompleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Review & Confirm</h2>
        <p className="text-gray-600 mt-1">Confirm all steps are done, then finish onboarding.</p>
      </div>

      <div className="space-y-2">
        {onboardingSteps.map((step, idx) => (
          <div
            key={step.key}
            className="flex items-center justify-between border border-gray-200 rounded-md px-4 py-3"
          >
            <div>
              <p className="text-sm text-gray-500 uppercase">{`Step ${idx + 1}`}</p>
              <p className="text-base font-semibold text-gray-900">{step.label}</p>
            </div>
            {completedSet.has(step.key) ? (
              <span className="text-green-600 text-sm font-semibold">Completed</span>
            ) : (
              <button
                className="text-blue-600 text-sm underline"
                onClick={() => navigate(step.path)}
              >
                Go to step
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center space-x-3 pt-2">
        <button
          onClick={handleComplete}
          disabled={isCompleting}
          className="px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isCompleting ? 'Finishing...' : 'Finish Onboarding'}
        </button>
        <p className="text-sm text-gray-500">You can revisit onboarding later if needed.</p>
      </div>
    </div>
  )
}
