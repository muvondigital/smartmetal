import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveOnboardingStep } from '../../services/onboardingApi'
import { useAuth } from '../../contexts/AuthContext'
import { useOnboardingAnalytics } from './useOnboardingAnalytics'

export default function ApprovalRulesStep() {
  const navigate = useNavigate()
  const { setTenantOnboardingStatus } = useAuth()
  const [enabled, setEnabled] = useState(false)
  const [threshold, setThreshold] = useState(10000)
  const [isSaving, setIsSaving] = useState(false)
  const [touched, setTouched] = useState(false)
  const { trackStepCompleted } = useOnboardingAnalytics('approval_rules')

  const isValid = useMemo(() => {
    if (!enabled) return true
    return Number.isFinite(threshold) && threshold > 0
  }, [enabled, threshold])

  const handleSave = async () => {
    setTouched(true)
    if (!isValid) return
    setIsSaving(true)
    try {
      const status = await saveOnboardingStep('approval_rules', true)
      setTenantOnboardingStatus(status)
      trackStepCompleted()
      navigate('/onboarding/operator-rules')
    } catch (error) {
      console.error('Failed to save approval rules', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Approval Rules</h2>
        <p className="text-gray-600 mt-1">
          Configure basic approval thresholds to control who can approve pricing.
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="text-sm text-gray-700">Enable approval workflow</span>
        </label>

        {enabled && (
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Require approval for RFQs over</span>
            <div className="mt-1 flex items-center space-x-2">
              <span className="text-sm text-gray-600">$</span>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-32 rounded-md border border-gray-300 px-3 py-2"
                min={0}
                step={1000}
                aria-invalid={touched && enabled && !isValid ? 'true' : 'false'}
              />
            </div>
            {touched && enabled && !isValid && (
              <p className="text-xs text-red-600 mt-1">Enter a threshold greater than 0.</p>
            )}
          </label>
        )}
      </div>

      <div className="flex items-center space-x-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving || !isValid}
          className="px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </button>
        <button
          onClick={() => navigate('/onboarding/operator-rules')}
          className="text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
