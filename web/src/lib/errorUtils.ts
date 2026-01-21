/**
 * Utility functions for error handling
 */

/**
 * Extracts a user-friendly error message from various error types
 * @param error - The error object (can be Error, string, or unknown)
 * @returns A clean error message string
 */
export function getErrorMessage(error: unknown): string {
  if (!error) {
    return 'An unexpected error occurred';
  }

  // Handle Error instances
  if (error instanceof Error) {
    return error.message;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  // Handle objects with message property
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  // Handle objects with error property
  if (typeof error === 'object' && 'error' in error) {
    const errorProp = (error as { error: unknown }).error;
    if (typeof errorProp === 'string') {
      return errorProp;
    }
    if (errorProp && typeof errorProp === 'object' && 'message' in errorProp) {
      const message = (errorProp as { message: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
    }
  }

  // Fallback: try to stringify the error
  try {
    const stringified = JSON.stringify(error);
    if (stringified !== '{}') {
      return stringified;
    }
  } catch {
    // Ignore stringify errors
  }

  return 'An unexpected error occurred';
}

export function isAuthError(error: unknown): boolean {
  return (
    (error instanceof Error &&
      (error.message === 'Session expired. Please log in again.' || (error as any).code === 'AUTH_REQUIRED')) ||
    (typeof error === 'object' && !!error && (error as any).code === 'AUTH_REQUIRED')
  );
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Network error:');
}
