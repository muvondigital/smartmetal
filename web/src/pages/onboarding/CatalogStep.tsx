import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveOnboardingStep } from '../../services/onboardingApi'
import { useAuth } from '../../contexts/AuthContext'
import { useOnboardingAnalytics } from './useOnboardingAnalytics'

export default function CatalogStep() {
  const navigate = useNavigate()
  const { setTenantOnboardingStatus } = useAuth()
  const [reviewed, setReviewed] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [touched, setTouched] = useState(false)
  const { trackStepCompleted } = useOnboardingAnalytics('catalog')

  const isValid = reviewed

  const handleSave = async () => {
    setTouched(true)
    if (!isValid) return
    setIsSaving(true)
    try {
      const status = await saveOnboardingStep('catalog', true)
      setTenantOnboardingStatus(status)
      trackStepCompleted()
      navigate('/onboarding/notifications')
    } catch (error) {
      console.error('Failed to save catalog step', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Catalog & Supplier Setup</h2>
        <p className="text-gray-600 mt-1">Confirm your catalog and supplier data before going live.</p>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          Review your materials and suppliers. You can manage catalog details from the catalog page later.
        </p>
        <a
          href="/materials"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 text-sm underline"
        >
          Open catalog management
        </a>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
            aria-invalid={touched && !reviewed ? 'true' : 'false'}
          />
          <span className="text-sm text-gray-700">I have reviewed catalog settings</span>
        </label>
        {touched && !reviewed && (
          <p className="text-xs text-red-600 mt-1">Confirm catalog review before continuing.</p>
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
          onClick={() => navigate('/onboarding/notifications')}
          className="text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
