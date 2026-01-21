// Central API client: attaches auth + tenant headers for every request.
// All authenticated calls should go through this client.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
export const TENANT_CODE_STORAGE_KEY = 'smartmetal_tenant_code'
const LEGACY_TENANT_CODE_KEY = 'tenantCode'

const NETWORK_ERROR_MESSAGE =
  'Network error: Unable to connect to the server. Please ensure the backend is running.'

/**
 * Get auth token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('authToken') || localStorage.getItem('token')
}

/**
 * Get tenant code from localStorage
 */
function getTenantCode(): string | null {
  const storedTenant = (localStorage.getItem(TENANT_CODE_STORAGE_KEY) || '').trim()
  if (storedTenant) {
    return storedTenant.toLowerCase()
  }

  const legacyTenant = (localStorage.getItem(LEGACY_TENANT_CODE_KEY) || '').trim()
  if (legacyTenant) {
    const normalized = legacyTenant.toLowerCase()
    localStorage.setItem(TENANT_CODE_STORAGE_KEY, normalized)
    return normalized
  }

  return null
}

// Flag to prevent multiple simultaneous redirects
let isRedirecting = false

/**
 * Clear authentication data from localStorage
 * Called automatically when auth errors occur (401/403)
 */
function clearAuthData(): void {
  localStorage.removeItem('authToken')
  localStorage.removeItem('token')
  localStorage.removeItem(TENANT_CODE_STORAGE_KEY)
  localStorage.removeItem(LEGACY_TENANT_CODE_KEY)
  
  // Redirect to login page (only once, even if multiple 401s happen)
  if (!isRedirecting) {
    isRedirecting = true
    // Use setTimeout to avoid navigation blocking
    setTimeout(() => {
      window.location.href = '/login'
    }, 100)
  }
}

/**
 * Build headers with authentication and tenant headers
 *
 * Internally we normalize to a simple string map to keep TypeScript happy
 * when adding Authorization / X-Tenant-Code keys.
 */
type HeaderMap = Record<string, string>

function buildHeaders(customHeaders?: HeadersInit): HeaderMap {
  const headers: HeaderMap = {
    'Content-Type': 'application/json',
    ...(customHeaders as HeaderMap | undefined),
  }

  // Add Authorization header if token exists
  const token = getAuthToken()
  const hasAuthHeader = Object.keys(headers).some(
    (key) => key.toLowerCase() === 'authorization'
  )
  if (token && !hasAuthHeader) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Add X-Tenant-Code header if tenant code exists and is not empty
  const tenantCode = getTenantCode()
  const hasTenantHeader = Object.keys(headers).some(
    (key) => key.toLowerCase() === 'x-tenant-code'
  )
  // Only send header if tenantCode exists and is not an empty string
  if (tenantCode && tenantCode.trim() && !hasTenantHeader) {
    headers['X-Tenant-Code'] = tenantCode.trim()
  }

  return headers
}

export function getAuthHeaders(customHeaders?: HeadersInit): HeaderMap {
  return buildHeaders(customHeaders)
}

export async function request<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers = buildHeaders(options?.headers)
  const fetchOptions: RequestInit = { ...options, headers }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(NETWORK_ERROR_MESSAGE)
    }
    throw error
  }

  // Treat missing responses as network failures
  if (!response) {
    throw new Error(NETWORK_ERROR_MESSAGE)
  }

  let data: any = null
  if (response.status !== 204) {
    data = await response.json().catch(() => null)
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      data?.details ||
      response.statusText

    if (response.status === 401) {
      clearAuthData() // Clear invalid token and redirect to login
      const authError = new Error('Session expired. Please log in again.')
      ;(authError as any).status = response.status
      ;(authError as any).code = 'AUTH_REQUIRED'
      throw authError
    }

    if (response.status === 403) {
      // User is authenticated but doesn't have permission - don't log them out!
      const authError = new Error('You do not have permission to access this resource.')
      ;(authError as any).status = response.status
      ;(authError as any).code = 'FORBIDDEN'
      throw authError
    }

    // Create error with structured details preserved
    const error = new Error(message || `Request failed with status ${response.status}`)
    ;(error as any).status = response.status
    ;(error as any).code = data?.error?.code || null
    ;(error as any).details = data?.error?.details || data?.details || null

    if (response.status >= 500) {
      throw new Error(`Server error: ${message}`)
    }

    throw error
  }

  if (response.status === 204) {
    return undefined as T
  }

  return data as T
}

export async function requestMultipart<T>(endpoint: string, formData: FormData): Promise<T> {
  try {
    // Build headers without Content-Type (browser will set it with boundary)
    const headers: HeadersInit = {}
    const token = getAuthToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    const tenantCode = getTenantCode()
    // Only send header if tenantCode exists and is not an empty string
    if (tenantCode && tenantCode.trim()) {
      headers['X-Tenant-Code'] = tenantCode.trim()
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
      // Don't set Content-Type header - browser will set it with boundary
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }))
      if (response.status === 401) {
        clearAuthData() // Clear invalid token and redirect to login
        const authError = new Error('Session expired. Please log in again.')
        ;(authError as any).code = 'AUTH_REQUIRED'
        throw authError
      }
      if (response.status === 403) {
        // User is authenticated but doesn't have permission - don't log them out!
        const authError = new Error('You do not have permission to access this resource.')
        ;(authError as any).code = 'FORBIDDEN'
        throw authError
      }
      if (response.status >= 500) {
        throw new Error(errorData.error || errorData.details || `Server error: ${response.statusText}`)
      }
      throw new Error(errorData.error || errorData.details || `API error: ${response.statusText}`)
    }

    return response.json()
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(NETWORK_ERROR_MESSAGE)
    }
    throw error
  }
}

import type { Rfq } from '../types'

export async function getRfqs() {
  return request<Rfq[]>('/rfqs')
}

export async function getRfq(id: string) {
  return request<Rfq>(`/rfqs/${id}`)
}

export async function createRfq(data: { 
  customer_name: string
  project_type?: 'standard' | 'rush' | 'ltpa' | 'spot'
}) {
  return request<Rfq>('/rfqs', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateRfq(id: string, data: {
  title?: string
  description?: string
  status?: string
}) {
  return request<Rfq>(`/rfqs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteRfq(id: string) {
  return request<void>(`/rfqs/${id}`, {
    method: 'DELETE',
  })
}

export async function getRfqItems(rfqId: string) {
  return request<any[]>(`/rfqs/${rfqId}/items`)
}

export interface RfqItemWithPricing {
  id: string
  rfq_id: string
  line_number: number
  description: string
  quantity: number
  unit: string
  material_code?: string | null
  size_display?: string | null
  size1_raw?: string | null
  size2_raw?: string | null
  // HS Code fields (Phase 4)
  hs_code?: string | null
  import_duty_rate?: number | null
  import_duty_amount?: number | null
  hs_match_source?: 'RULE' | 'MAPPING' | 'DIRECT_HS' | 'MANUAL' | 'NONE' | null
  hs_confidence?: number | null
  // Origin and final duty fields (Phase 5)
  origin_country?: string | null
  trade_agreement?: string | null
  final_import_duty_rate?: number | null
  final_import_duty_amount?: number | null
  needs_review?: boolean
  quantity_source?: 'explicit' | 'inferred_price_line' | 'default_1' | null
  confidence?: 'low' | 'medium' | 'high' | null
  supplier_options?: any
  supplier_selected_option?: 'A' | 'B' | 'C' | null
  supplier_selected_at?: string | null
  has_pricing: boolean
  pricing: {
    base_cost: number
    unit_price: number
    total_price: number
    markup_pct: number
    logistics_cost: number
    risk_pct: number
    risk_cost: number
    pricing_method: 'agreement' | 'rule_based'
    currency: string
    price_agreement: {
      id: string
      agreement_code: string
      valid_from: string
      valid_to: string
    } | null
  } | null
}

export async function getRfqItemsWithPricing(rfqId: string) {
  return request<RfqItemWithPricing[]>(`/rfqs/${rfqId}/items-with-pricing`)
}

export async function addRfqItem(rfqId: string, item: {
  description: string
  quantity: number
  unit: string
  material_code?: string | null
  line_number?: number | null
  size_display?: string | null
  size1_raw?: string | null
  size2_raw?: string | null
  // HS Code fields (Phase 4)
  hs_code?: string | null
  import_duty_rate?: number | null
}) {
  return request<any>(`/rfqs/${rfqId}/items`, {
    method: 'POST',
    body: JSON.stringify(item),
  })
}

export async function updateRfqItem(rfqId: string, itemId: string, updates: {
  description?: string
  quantity?: number
  unit?: string
  material_code?: string | null
  line_number?: number | null
  size_display?: string | null
  size1_raw?: string | null
  size2_raw?: string | null
  // HS Code fields (Phase 4)
  hs_code?: string | null
  import_duty_rate?: number | null
  // Origin field (Phase 5)
  origin_country?: string | null
}) {
  return request<any>(`/rfqs/${rfqId}/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function saveSupplierSelection(
  rfqId: string,
  itemId: string,
  payload: {
    selected_option: 'A' | 'B' | 'C'
    supplier_options?: any
    selected_at?: string
  }
) {
  return request<any>(`/rfqs/${rfqId}/items/${itemId}/supplier-selection`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteRfqItem(rfqId: string, itemId: string) {
  return request<{ success: boolean }>(`/rfqs/${rfqId}/items/${itemId}`, {
    method: 'DELETE',
  })
}

export async function getAgreement(id: string) {
  return request<any>(`/agreements/${id}`)
}

// OCR functions
import type { OcrExtractResponse, StructuredOcr, AiParseResponse } from '../types'

export async function uploadOcrFile(file: File): Promise<OcrExtractResponse> {
  const formData = new FormData()
  formData.append('file', file)
  
  return requestMultipart<OcrExtractResponse>('/ocr/extract', formData)
}

// AI parsing functions
export async function postAiParseRfq(
  structured: StructuredOcr,
  options: { autoCreateRfq?: boolean; attachMaterials?: boolean; originalFilename?: string } = {}
): Promise<AiParseResponse> {
  return request<AiParseResponse>('/ai/parse-rfq-json', {
    method: 'POST',
    body: JSON.stringify({
      structured,
      options: {
        autoCreateRfq: options.autoCreateRfq ?? true,
        attachMaterials: options.attachMaterials ?? true,
        originalFilename: options.originalFilename,
      },
    }),
  })
}

// Pricing Run / Quote functions
import type { Quote } from '../components/dashboard/DataTable'
import { mapPricingRunToQuote } from '../lib/quoteMapper'

export async function getQuoteById(id: string): Promise<Quote> {
  const pricingRun = await request<any>(`/pricing-runs/${id}`)
  return mapPricingRunToQuote(pricingRun)
}

// API client object for axios-like usage
export const apiClient = {
  get: async <T = any>(url: string): Promise<{ data: T }> => {
    // Remove /api prefix if present since request() already includes it
    const endpoint = url.startsWith('/api/') ? url.substring(5) : url;
    const data = await request<T>(endpoint);
    return { data };
  },
  post: async <T = any>(url: string, body?: any): Promise<{ data: T }> => {
    const endpoint = url.startsWith('/api/') ? url.substring(5) : url;
    const data = await request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  },
  put: async <T = any>(url: string, body?: any): Promise<{ data: T }> => {
    const endpoint = url.startsWith('/api/') ? url.substring(5) : url;
    const data = await request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
    return { data };
  },
  delete: async <T = any>(url: string): Promise<{ data: T }> => {
    const endpoint = url.startsWith('/api/') ? url.substring(5) : url;
    const data = await request<T>(endpoint, {
      method: 'DELETE',
    });
    return { data };
  },
};
