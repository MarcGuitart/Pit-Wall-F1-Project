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

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export function parseAnalysisError(err: unknown): AnalysisError {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      // FastAPI wraps detail in { detail: ... } — extract the inner code if present
      const inner = (err.detail as { detail?: Record<string, unknown> } | undefined)?.detail
      if (inner?.code === 'session_not_cached') {
        return {
          code: 'SESSION_NOT_CACHED',
          message:
            (inner.message as string | undefined) ??
            'This session is not available in the production demo. Try Brasil 2024 (9636) or España 2024 (9539).',
        }
      }
    }
    if (err.status === 425) {
      const detail = err.detail as Record<string, unknown> | undefined
      return {
        code: 'SESSION_NOT_HISTORICAL_YET',
        message:
          (detail?.message as string | undefined) ??
          'This session is still in the live window. Try again after the session ends.',
        retryAfterMinutes: detail?.retry_after_minutes as number | undefined,
        unlockAtUtc: detail?.unlock_at_utc as string | undefined,
      }
    }
    if (err.status === 429) {
      return {
        code: 'OPENF1_RATE_LIMIT',
        message:
          'OpenF1 throttled this request. Cached partial data was preserved. Retry in a moment — the analysis will resume from where it stopped.',
      }
    }
    if (err.status === 503) {
      return {
        code: 'OPENF1_ERROR',
        message:
          (err.detail as Record<string, unknown> | undefined)?.detail as string ??
          'OpenF1 returned an error for this session. The data may not yet be published or the session key may be invalid.',
      }
    }
    if (err.status === 500) {
      return {
        code: 'ANALYSIS_FAILED',
        message: 'Some modules could not be computed due to insufficient data. Available modules are shown below.',
      }
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
