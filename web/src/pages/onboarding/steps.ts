export type OnboardingStepKey =
  | 'profile'
  | 'approval_rules'
  | 'operator_rules'
  | 'pricing'
  | 'catalog'
  | 'notifications'
  | 'regulatory'
  | 'review'

export interface OnboardingStep {
  key: OnboardingStepKey
  label: string
  path: string
  description?: string
}

export const onboardingSteps: OnboardingStep[] = [
  { key: 'profile', label: 'Tenant Profile', path: '/onboarding/profile' },
  { key: 'approval_rules', label: 'Approval Rules', path: '/onboarding/approval-rules' },
  { key: 'operator_rules', label: 'Operator Rules', path: '/onboarding/operator-rules' },
  { key: 'pricing', label: 'Pricing', path: '/onboarding/pricing' },
  { key: 'catalog', label: 'Catalog', path: '/onboarding/catalog' },
  { key: 'notifications', label: 'Notifications', path: '/onboarding/notifications' },
  { key: 'regulatory', label: 'Regulatory', path: '/onboarding/regulatory' },
  { key: 'review', label: 'Review & Confirm', path: '/onboarding/review' },
]

export const firstOnboardingStepPath = onboardingSteps[0].path

export function getStepPath(key: OnboardingStepKey): string {
  return onboardingSteps.find((step) => step.key === key)?.path || firstOnboardingStepPath
}
