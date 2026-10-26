import { describe, expect, it } from 'vitest'
import { ApiError, parseAnalysisError } from './errors'

describe('parseAnalysisError', () => {
  it('ANALYSIS_BUSY (the backend cap on cold builds) is shown as the rate countdown state', () => {
    // The seconds (retryAfterSeconds) are read by ui/migration's parser; this
    // branch only maps the code, the one line the cap needs on the frontend.
    const e = parseAnalysisError(new ApiError(429, 'ANALYSIS_BUSY', 'Other analyses are being computed right now.', { retry_after_seconds: 20 }))
    expect(e.code).toBe('OPENF1_RATE_LIMIT')
  })
  it('an unknown code stays UNKNOWN', () => {
    expect(parseAnalysisError(new ApiError(500, 'SOMETHING_NEW', 'x')).code).toBe('UNKNOWN')
  })
})
