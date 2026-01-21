import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveOnboardingStep } from '../../services/onboardingApi'
import { useAuth } from '../../contexts/AuthContext'
import { useOnboardingAnalytics } from './useOnboardingAnalytics'

export default function TenantProfileStep() {
  const navigate = useNavigate()
  const { setTenantOnboardingStatus } = useAuth()
  const [companyName, setCompanyName] = useState('')
  const [country, setCountry] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [isSaving, setIsSaving] = useState(false)
  const [touched, setTouched] = useState({ company: false, country: false })
  const { trackStepCompleted } = useOnboardingAnalytics('profile')

  const isValid = useMemo(
    () => companyName.trim().length > 1 && country.trim().length > 1 && !!currency,
    [companyName, country, currency]
  )

  const handleSave = async () => {
    if (!isValid) {
      setTouched({ company: true, country: true })
      return
    }
    setIsSaving(true)
    try {
      const status = await saveOnboardingStep('profile', true)
      setTenantOnboardingStatus(status)
      trackStepCompleted()
      navigate('/onboarding/approval-rules')
    } catch (error) {
      console.error('Failed to save profile step', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Tenant Profile</h2>
        <p className="text-gray-600 mt-1">Tell us about your company to personalize your workspace.</p>
      </div>

      <div className="grid gap-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Company Name</span>
          <input
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder="Acme Metals"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, company: true }))}
            aria-invalid={touched.company && !companyName.trim() ? 'true' : 'false'}
            required
          />
          {touched.company && !companyName.trim() && (
            <p className="text-xs text-red-600 mt-1">Company name is required.</p>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Country</span>
          <input
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            placeholder="United States"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, country: true }))}
            aria-invalid={touched.country && !country.trim() ? 'true' : 'false'}
            required
          />
          {touched.country && !country.trim() && (
            <p className="text-xs text-red-600 mt-1">Country is required.</p>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Default Currency</span>
          <select
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
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
          onClick={() => navigate('/onboarding/approval-rules')}
          className="text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
