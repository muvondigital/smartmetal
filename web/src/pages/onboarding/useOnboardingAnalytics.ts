import { useCallback, useEffect } from 'react'
import type { OnboardingStepKey } from './steps'

type OnboardingEventType = 'onboarding_step_viewed' | 'onboarding_step_completed'

const STORAGE_KEY = 'onboardingAnalyticsEvents'

function persistLocally(event: { type: OnboardingEventType; step: OnboardingStepKey; timestamp: string }) {
  try {
    const existingRaw = sessionStorage.getItem(STORAGE_KEY)
    let existing: unknown = []
    if (existingRaw) {
      const parsed = JSON.parse(existingRaw)
      if (Array.isArray(parsed)) {
        existing = parsed
      }
    }

    const trimmed = (existing as unknown[]).slice(-50) // keep last 50
    trimmed.push(event)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Best-effort only
  }
}

function emit(event: OnboardingEventType, step: OnboardingStepKey) {
  const payload = { type: event, step, timestamp: new Date().toISOString() }

  // Send to optional analytics client if present
  try {
    const analytics: any = (window as any)?.analytics
    if (analytics?.track) {
      analytics.track(event, payload)
    }
  } catch {
    // Ignore analytics client errors
  }

  persistLocally(payload)

  if (import.meta?.env?.MODE !== 'production') {
    // Provide lightweight debug signal during development
    // eslint-disable-next-line no-console
    console.debug('[onboarding-analytics]', payload)
  }
}

export function useOnboardingAnalytics(step: OnboardingStepKey) {
  useEffect(() => {
    emit('onboarding_step_viewed', step)
  }, [step])

  const trackStepCompleted = useCallback(() => {
    emit('onboarding_step_completed', step)
  }, [step])

  return { trackStepCompleted }
}
