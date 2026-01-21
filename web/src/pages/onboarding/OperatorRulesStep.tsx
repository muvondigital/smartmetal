import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveOnboardingStep } from '../../services/onboardingApi'
import { useAuth } from '../../contexts/AuthContext'
import { useOnboardingAnalytics } from './useOnboardingAnalytics'

export default function OperatorRulesStep() {
  const navigate = useNavigate()
  const { setTenantOnboardingStatus } = useAuth()
  const [kycRequired, setKycRequired] = useState(true)
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const { trackStepCompleted } = useOnboardingAnalytics('operator_rules')

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const status = await saveOnboardingStep('operator_rules', true)
      setTenantOnboardingStatus(status)
      trackStepCompleted()
      navigate('/onboarding/pricing')
    } catch (error) {
      console.error('Failed to save operator rules', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Operator / KYC Rules</h2>
        <p className="text-gray-600 mt-1">Capture basic compliance requirements for operators.</p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={kycRequired} onChange={(e) => setKycRequired(e.target.checked)} />
          <span className="text-sm text-gray-700">Require KYC verification for operators</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Notes</span>
          <textarea
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any custom operator rules or notes..."
          />
        </label>
      </div>

      <div className="flex items-center space-x-3 pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </button>
        <button
          onClick={() => navigate('/onboarding/pricing')}
          className="text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
