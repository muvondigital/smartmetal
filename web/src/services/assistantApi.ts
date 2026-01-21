/**
 * Assistant API Service
 * 
 * Frontend service for the new /api/v1/assistant/query endpoint
 * 
 * TODO: Add unit tests once frontend testing framework is standardized.
 * Suggested tests:
 * - callAssistantQuery() builds correct POST payload
 * - Ensures tenantId and role are included
 * - Handles undefined/null values safely
 * - Calls correct URL (/api/v1/assistant/query)
 * - Proper error handling
 */

import { request as apiRequest } from '../api/client';

export interface AssistantQueryRequest {
  tenantId: string;
  role: 'SALES' | 'PROCUREMENT' | 'MANAGER' | 'ADMIN';
  message: string;
  history: Array<{ role?: string; content?: string; message?: string } | string>;
}

export interface AssistantAction {
  type: string;
  target?: string;
  label?: string;
}

export interface AssistantQueryResponse {
  response: string;
  actions: AssistantAction[];
  followUp: boolean; // True if this is a clarification question
  clarificationOptions?: string[]; // Optional list of options to choose from
  debug: {
    intent: string;
    confidence: number; // 0-1 confidence score
    entities: Record<string, any>;
    reasons: string[]; // Human-readable reasons for classification
    metadata?: any;
    error?: string;
  };
}

/**
 * Get tenantId from user session or default tenant
 * This is a placeholder - in production, get from auth context
 */
function getTenantId(): string {
  // Try to get from localStorage or sessionStorage
  const stored = localStorage.getItem('tenantId') || sessionStorage.getItem('tenantId');
  if (stored) {
    return stored;
  }
  
  // Default tenant ID (should be replaced with actual default)
  // In production, this should come from the auth context
  return 'default-tenant-id';
}

/**
 * Get user role from session or default
 */
function getUserRole(): 'SALES' | 'PROCUREMENT' | 'MANAGER' | 'ADMIN' {
  const stored = localStorage.getItem('userRole') || sessionStorage.getItem('userRole');
  if (stored && ['SALES', 'PROCUREMENT', 'MANAGER', 'ADMIN'].includes(stored)) {
    return stored as 'SALES' | 'PROCUREMENT' | 'MANAGER' | 'ADMIN';
  }
  return 'SALES'; // Default role
}

/**
 * Call the assistant query endpoint
 */
export async function callAssistantQuery(
  message: string,
  history: Array<{ role?: string; content?: string; message?: string } | string> = [],
  tenantId?: string,
  role?: 'SALES' | 'PROCUREMENT' | 'MANAGER' | 'ADMIN'
): Promise<AssistantQueryResponse> {
  // Ensure message is not undefined
  if (!message || typeof message !== 'string') {
    throw new Error('Message is required and must be a string');
  }

  // Ensure history is an array
  if (!Array.isArray(history)) {
    history = [];
  }

  // Get tenantId and role (use provided or fallback to defaults)
  const finalTenantId = tenantId || getTenantId();
  const finalRole = role || getUserRole();

  // Ensure tenantId is valid
  if (!finalTenantId || typeof finalTenantId !== 'string') {
    throw new Error('tenantId is required');
  }

  // Normalize history format
  const normalizedHistory = history.map(item => {
    if (typeof item === 'string') {
      return { role: 'user', content: item };
    }
    if (item && typeof item === 'object') {
      return {
        role: item.role || 'user',
        content: item.content || item.message || ''
      };
    }
    return { role: 'user', content: '' };
  }).filter(item => item.content && item.content.length > 0);

  const payload: AssistantQueryRequest = {
    tenantId: finalTenantId,
    role: finalRole,
    message: message,
    history: normalizedHistory
  };

  const data = await apiRequest<AssistantQueryResponse>('/v1/assistant/query', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    response: data.response || 'No response received',
    actions: Array.isArray((data as any).actions) ? (data as any).actions : [],
    followUp: (data as any).followUp || false,
    clarificationOptions: (data as any).clarificationOptions || [],
    debug: {
      intent: data.debug?.intent || 'UNKNOWN_INTENT',
      confidence: data.debug?.confidence || 0,
      entities: data.debug?.entities || {},
      reasons: data.debug?.reasons || [],
      metadata: data.debug?.metadata,
      error: data.debug?.error,
    },
  };
}

