import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveOnboardingStep } from '../../services/onboardingApi'
import { useAuth } from '../../contexts/AuthContext'
import { useOnboardingAnalytics } from './useOnboardingAnalytics'

export default function PricingStep() {
  const navigate = useNavigate()
  const { setTenantOnboardingStatus } = useAuth()
  const [lmeEnabled, setLmeEnabled] = useState(false)
  const [pricingModel, setPricingModel] = useState<'fixed' | 'dynamic'>('fixed')
  const [markup, setMarkup] = useState(5)
  const [isSaving, setIsSaving] = useState(false)
  const [touched, setTouched] = useState(false)
  const { trackStepCompleted } = useOnboardingAnalytics('pricing')

  const isValid = useMemo(() => Number.isFinite(markup) && markup >= 0 && !!pricingModel, [markup, pricingModel])

  const handleSave = async () => {
    setTouched(true)
    if (!isValid) return
    setIsSaving(true)
    try {
      const status = await saveOnboardingStep('pricing', true)
      setTenantOnboardingStatus(status)
      trackStepCompleted()
      navigate('/onboarding/catalog')
    } catch (error) {
      console.error('Failed to save pricing step', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Pricing Configuration</h2>
        <p className="text-gray-600 mt-1">Set defaults for your pricing workflow.</p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={lmeEnabled} onChange={(e) => setLmeEnabled(e.target.checked)} />
          <span className="text-sm text-gray-700">Enable LME integration</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Default pricing model</span>
          <select
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            value={pricingModel}
            onChange={(e) => setPricingModel(e.target.value as 'fixed' | 'dynamic')}
          >
            <option value="fixed">Fixed</option>
            <option value="dynamic">Dynamic</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Default markup (%)</span>
          <input
            type="number"
            className="mt-1 w-28 rounded-md border border-gray-300 px-3 py-2"
            value={markup}
            onChange={(e) => setMarkup(Number(e.target.value))}
            min={0}
            step={0.5}
            aria-invalid={touched && !isValid ? 'true' : 'false'}
          />
          {touched && !isValid && <p className="text-xs text-red-600 mt-1">Markup must be zero or greater.</p>}
        </label>
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
          onClick={() => navigate('/onboarding/catalog')}
          className="text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
