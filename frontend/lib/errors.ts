/**
 * Error model shared by every backend call.
 *
 * `ApiError` carries the normalised `{code, message, details}` produced by
 * `unwrapError` in lib/api.ts — consumers never look at the raw body.
 */

export type ErrorCode =
  | 'SESSION_NOT_HISTORICAL_YET'
  | 'SESSION_NOT_CACHED'
  | 'OPENF1_RATE_LIMIT'
  | 'ANALYSIS_FAILED'
  | 'OPENF1_ERROR'
  | 'UNKNOWN'

export type AnalysisError = {
  code: ErrorCode
  message: string
  retryAfterMinutes?: number
  unlockAtUtc?: string
}

export type ErrorDetails = Record<string, unknown>

export class ApiError extends Error {
  status: number
  code: string
  details: ErrorDetails | null

  constructor(status: number, code: string, message: string, details: ErrorDetails | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Backend codes → analysis-page UI state. The body is already unwrapped; only `code` matters here. */
const CODE_TO_STATE: Record<string, ErrorCode> = {
  SESSION_NOT_HISTORICAL_YET: 'SESSION_NOT_HISTORICAL_YET',
  SESSION_NOT_CACHED: 'SESSION_NOT_CACHED',
  OPENF1_RATE_LIMIT: 'OPENF1_RATE_LIMIT',
  OPENF1_ERROR: 'OPENF1_ERROR',
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  // A crash inside /analysis is a failed analysis from the page's point of view.
  INTERNAL_ERROR: 'ANALYSIS_FAILED',
}

export function parseAnalysisError(err: unknown): AnalysisError {
  if (err instanceof ApiError) {
    const code = CODE_TO_STATE[err.code] ?? 'UNKNOWN'
    const retry = err.details?.retry_after_minutes
    const unlock = err.details?.unlock_at_utc
    return {
      code,
      message: err.message,
      retryAfterMinutes: typeof retry === 'number' ? retry : undefined,
      unlockAtUtc: typeof unlock === 'string' ? unlock : undefined,
    }
  }

  if (err instanceof TypeError && err.message.includes('fetch')) {
    return {
      code: 'OPENF1_ERROR',
      message: 'Could not connect to the backend. Check that the API server is running.',
    }
  }

  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : 'An unexpected error occurred.',
  }
}
