import { request } from '../api/client'

export interface QuickEstimateRequest {
  searchTerm?: string
  materialId?: string
  markupPercent?: number
  quantity?: number
  filters?: {
    size?: string
    schedule?: string
    grade?: string
  }
}

export interface QuickEstimateMaterial {
  id: string
  material_code: string
  description: string
  category?: string
  size?: string
  schedule?: string
  grade?: string
}

export interface QuickEstimateResult {
  material: QuickEstimateMaterial
  baselinePrice: number
  markupPercent: number
  estimatedUnitPrice: number
  quantity: number | null
  estimatedTotal: number | null
  currency: string | null
  disclaimer: string
}

export interface QuickEstimateResponse {
  estimate: QuickEstimateResult
}

export async function getQuickEstimate(payload: QuickEstimateRequest): Promise<QuickEstimateResult> {
  try {
    const data = await request<QuickEstimateResponse>('/qee/estimate', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return data.estimate
  } catch (error: any) {
    const message =
      (error && error.message) || 'Failed to generate quick estimate. Please try again.'
    throw new Error(message)
  }
}

