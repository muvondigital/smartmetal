import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveOnboardingStep } from '../../services/onboardingApi'
import { useAuth } from '../../contexts/AuthContext'
import { useOnboardingAnalytics } from './useOnboardingAnalytics'

export default function NotificationsStep() {
  const navigate = useNavigate()
  const { setTenantOnboardingStatus } = useAuth()
  const [email, setEmail] = useState('')
  const [rfqNotifications, setRfqNotifications] = useState(true)
  const [approvalNotifications, setApprovalNotifications] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [touched, setTouched] = useState(false)
  const { trackStepCompleted } = useOnboardingAnalytics('notifications')

  const emailValid = useMemo(() => {
    if (!email.trim()) return false
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  }, [email])

  const isValid = emailValid

  const handleSave = async () => {
    setTouched(true)
    if (!isValid) return
    setIsSaving(true)
    try {
      const status = await saveOnboardingStep('notifications', true)
      setTenantOnboardingStatus(status)
      trackStepCompleted()
      navigate('/onboarding/regulatory')
    } catch (error) {
      console.error('Failed to save notifications step', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
        <p className="text-gray-600 mt-1">Configure how your team receives key notifications.</p>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Default notification email</span>
          <input
            type="email"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alerts@company.com"
            aria-invalid={touched && !emailValid ? 'true' : 'false'}
          />
          {touched && !emailValid && (
            <p className="text-xs text-red-600 mt-1">Enter a valid email for notifications.</p>
          )}
        </label>

        <label className="flex items-center space-x-2">
          <input type="checkbox" checked={rfqNotifications} onChange={(e) => setRfqNotifications(e.target.checked)} />
          <span className="text-sm text-gray-700">Send RFQ notifications</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={approvalNotifications}
            onChange={(e) => setApprovalNotifications(e.target.checked)}
          />
          <span className="text-sm text-gray-700">Send approval notifications</span>
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
          onClick={() => navigate('/onboarding/regulatory')}
          className="text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
