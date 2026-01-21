/**
 * Authentication Context
 * Manages authentication state (token, user, tenant) across the application
 * 
 * Part of: Shared login portal (Mode A) - Multi-tenant authentication
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { fetchTenantOnboardingStatus, type TenantOnboardingStatus } from '../services/onboardingApi'
import { TENANT_CODE_STORAGE_KEY } from '../api/client'

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'manager' | 'user' | 'viewer'
}

export interface Tenant {
  id: string
  code: string
  name: string
  is_demo?: boolean
}

export interface AuthState {
  user: User | null
  tenant: Tenant | null
  token: string | null
  isAuthenticated: boolean
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, tenantCode: string) => Promise<void>
  logout: () => void
  isLoading: boolean
  tenantOnboardingStatus: TenantOnboardingStatus | null
  setTenantOnboardingStatus: (status: TenantOnboardingStatus | null) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_TOKEN_KEY = 'authToken'
const TOKEN_KEY = 'token'
const TENANT_CODE_KEY = TENANT_CODE_STORAGE_KEY
const LEGACY_TENANT_CODE_KEY = 'tenantCode'
const USER_KEY = 'user'
const TENANT_KEY = 'tenant'
const USER_EMAIL_KEY = 'userEmail'
const TENANT_ONBOARDING_STATUS_KEY = 'tenantOnboardingStatus'

/**
 * AuthProvider component
 * Provides authentication state and methods to child components
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    tenant: null,
    token: null,
    isAuthenticated: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [tenantOnboardingStatus, setTenantOnboardingStatus] = useState<TenantOnboardingStatus | null>(null)

  // Load auth state from localStorage on mount
  useEffect(() => {
    // Protect against React strict mode double-mounting
    let isMounted = true

    const token = localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(TOKEN_KEY)
    const userStr = localStorage.getItem(USER_KEY)
    const tenantStr = localStorage.getItem(TENANT_KEY)
    const storedTenantCode = localStorage.getItem(TENANT_CODE_KEY) || localStorage.getItem(LEGACY_TENANT_CODE_KEY)
    if (!localStorage.getItem(TENANT_CODE_KEY) && storedTenantCode) {
      localStorage.setItem(TENANT_CODE_KEY, storedTenantCode.toLowerCase())
    }
    const onboardingStatusStr = sessionStorage.getItem(TENANT_ONBOARDING_STATUS_KEY)

    if (token && userStr && tenantStr) {
      try {
        const user = JSON.parse(userStr)
        const tenant = JSON.parse(tenantStr)

        // Set auth state immediately (don't wait for /me fetch)
        if (isMounted) {
          setAuthState({
            user,
            tenant,
            token,
            isAuthenticated: true,
          })

          if (onboardingStatusStr) {
            try {
              const parsedStatus = JSON.parse(onboardingStatusStr)
              setTenantOnboardingStatus(parsedStatus)
            } catch (error) {
              console.error('Failed to parse onboarding status from sessionStorage:', error)
              sessionStorage.removeItem(TENANT_ONBOARDING_STATUS_KEY)
            }
          }
        }

        // If tenant data is missing is_demo, fetch it from /me endpoint (non-blocking)
        if (tenant && tenant.is_demo === undefined) {
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
          fetch(`${API_BASE_URL}/v1/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (isMounted && data?.tenant) {
                const updatedTenant = { ...tenant, ...data.tenant }
                localStorage.setItem(TENANT_KEY, JSON.stringify(updatedTenant))
                setAuthState(prev => ({
                  ...prev,
                  tenant: updatedTenant,
                }))
              }
            })
            .catch(err => console.warn('Failed to refresh tenant data:', err))
        }
      } catch (error) {
        console.error('Failed to parse auth state from localStorage:', error)
        // Clear invalid data
        localStorage.removeItem(AUTH_TOKEN_KEY)
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem(TENANT_KEY)
        localStorage.removeItem(TENANT_CODE_KEY)
        localStorage.removeItem(LEGACY_TENANT_CODE_KEY)
        localStorage.removeItem(USER_EMAIL_KEY)
        sessionStorage.removeItem(TENANT_ONBOARDING_STATUS_KEY)
      }
    }

    if (isMounted) {
      setIsLoading(false)
    }

    // Cleanup: prevent state updates after unmount
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!authState.isAuthenticated || !authState.token) {
      setTenantOnboardingStatus(null)
      sessionStorage.removeItem(TENANT_ONBOARDING_STATUS_KEY)
      return
    }

    let isCancelled = false

    const loadOnboardingStatus = async () => {
      try {
        const status = await fetchTenantOnboardingStatus()
        if (!isCancelled) {
          setTenantOnboardingStatus(status)
          sessionStorage.setItem(TENANT_ONBOARDING_STATUS_KEY, JSON.stringify(status))
        }
      } catch (error) {
        console.error('Failed to fetch onboarding status:', error)
      }
    }

    loadOnboardingStatus()

    return () => {
      isCancelled = true
    }
  }, [authState.isAuthenticated, authState.token])

  /**
   * Login function
   * Authenticates user and stores auth state
   */
  const login = async (email: string, password: string, tenantCode: string): Promise<void> => {
    try {
      const normalizedTenantCode = (tenantCode || '').trim().toLowerCase()
      if (!normalizedTenantCode) {
        throw new Error('Please select a tenant before signing in.')
      }

      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'

      const response = await fetch(`${API_BASE_URL}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Code': normalizedTenantCode,
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          error: response.statusText 
        }))
        throw new Error(errorData.error?.message || errorData.error || 'Login failed')
      }

      const data = await response.json()

      const token = data.token
      const responseTenantCode = (data.tenant?.code || data.tenantCode || normalizedTenantCode || '').toLowerCase()
      const userEmail = data.user?.email || email

      // Fetch full user/tenant info from /me endpoint to ensure we have is_demo
      let fullTenantData = data.tenant
      try {
        const meHeaders: HeadersInit = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
        if (responseTenantCode) {
          meHeaders['X-Tenant-Code'] = responseTenantCode
        }

        const meResponse = await fetch(`${API_BASE_URL}/v1/auth/me`, {
          headers: meHeaders,
        })
        if (meResponse.ok) {
          const meData = await meResponse.json()
          if (meData.tenant) {
            fullTenantData = meData.tenant
          }
        }
      } catch (error) {
        console.warn('Failed to fetch full tenant data from /me endpoint:', error)
        // Continue with data from login response
      }

      // Store auth state (keep both keys for backward compatibility)
      localStorage.setItem(AUTH_TOKEN_KEY, token)
      localStorage.setItem(TOKEN_KEY, token)
      if (responseTenantCode) {
        localStorage.setItem(TENANT_CODE_KEY, responseTenantCode)
        localStorage.removeItem(LEGACY_TENANT_CODE_KEY)
      }
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      localStorage.setItem(TENANT_KEY, JSON.stringify(fullTenantData))
      localStorage.setItem(USER_EMAIL_KEY, userEmail)

      // Update state
      setAuthState({
        user: data.user,
        tenant: fullTenantData,
        token,
        isAuthenticated: true,
      })

      try {
        const status = await fetchTenantOnboardingStatus()
        setTenantOnboardingStatus(status)
        sessionStorage.setItem(TENANT_ONBOARDING_STATUS_KEY, JSON.stringify(status))
      } catch (error) {
        console.error('Failed to fetch onboarding status after login:', error)
      }
    } catch (error) {
      console.error('Login error:', error)
      throw error
    }
  }

  /**
   * Logout function
   * Clears auth state and redirects to login
   */
  const logout = () => {
    // Clear localStorage
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(TENANT_CODE_KEY)
    localStorage.removeItem(LEGACY_TENANT_CODE_KEY)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(TENANT_KEY)
    localStorage.removeItem(USER_EMAIL_KEY)
    sessionStorage.removeItem(TENANT_ONBOARDING_STATUS_KEY)

    // Clear state
    setAuthState({
      user: null,
      tenant: null,
      token: null,
      isAuthenticated: false,
    })
    setTenantOnboardingStatus(null)

    // Redirect to login
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        login,
        logout,
        isLoading,
        tenantOnboardingStatus,
        setTenantOnboardingStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/**
 * useAuth hook
 * Provides access to auth context
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}


