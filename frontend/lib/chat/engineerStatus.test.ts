import { describe, expect, it } from 'vitest'
import { engineerStatus, OFFLINE_COPY } from './engineerStatus'

describe('engineerStatus', () => {
  it('is online whenever the API says a model is ready, whichever provider', () => {
    expect(engineerStatus({ ai_ready: true, ollama_reachable: false })).toEqual({ online: true })
  })
  it('blames the model when the API answers without one', () => {
    expect(engineerStatus({ ai_ready: false, ollama_reachable: false })).toEqual({ online: false, reason: 'model' })
  })
  it('blames the server when /chat/health itself failed', () => {
    expect(engineerStatus({ ollama_reachable: false, error: 'Backend unreachable' })).toEqual({ online: false, reason: 'server' })
  })
  it('reads older backends without ai_ready from their Ollama fields', () => {
    expect(engineerStatus({ ollama_reachable: true, model_available: true })).toEqual({ online: true })
  })
  it('names no provider and no command', () => {
    for (const text of Object.values(OFFLINE_COPY)) expect(text).not.toMatch(/\b(ollama|groq|llama|terminal|serve|pull)\b/i)
  })
})
