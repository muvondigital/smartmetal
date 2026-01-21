import { request as apiRequest } from '../api/client'

export type TenantOnboardingStatus = {
  status: 'not_started' | 'in_progress' | 'completed'
  currentStep: string | null
  completedSteps: string[]
  completedAt: string | null
}

type ApiResponse<T> = { success: boolean; data: T } | T

export async function fetchTenantOnboardingStatus(): Promise<TenantOnboardingStatus> {
  const res = await apiRequest<ApiResponse<TenantOnboardingStatus>>('/onboarding/tenant/status')
  return (res as any).data || (res as any)
}

export async function saveOnboardingStep(step: string, markCompleted?: boolean): Promise<TenantOnboardingStatus> {
  const res = await apiRequest<ApiResponse<TenantOnboardingStatus>>('/onboarding/tenant/step', {
    method: 'POST',
    body: JSON.stringify({ step, markCompleted }),
  })
  return (res as any).data || (res as any)
}

export async function completeOnboarding(): Promise<TenantOnboardingStatus> {
  const res = await apiRequest<ApiResponse<TenantOnboardingStatus>>('/onboarding/tenant/complete', {
    method: 'POST',
  })
  return (res as any).data || (res as any)
}
