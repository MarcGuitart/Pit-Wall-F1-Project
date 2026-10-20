/**
 * Whether the race engineer can answer, read from /chat/health — and if not,
 * which side is down, in words a reader can act on. No provider names: the
 * backend picks Ollama or Groq, and which one is not the reader's business.
 *
 *   online   ai_ready: some model can answer
 *   model    the API answered, but no model is ready (ai_ready false)
 *   server   the API itself did not answer (fetchChatHealth's fallback carries
 *            `error` and no ai_ready)
 */
export type EngineerStatus = { online: true } | { online: false; reason: 'server' | 'model' }

type Health = {
  ai_ready?: boolean
  ollama_reachable?: boolean
  model_available?: boolean
  available_models?: string[]
  error?: string
}

export function engineerStatus(health: Health): EngineerStatus {
  if (health.ai_ready === undefined && health.error !== undefined) return { online: false, reason: 'server' }
  // Older backends had no ai_ready: fall back to the Ollama fields they did have.
  const ready = health.ai_ready ?? (!!health.ollama_reachable && (health.model_available ?? (health.available_models?.length ?? 0) > 0))
  return ready ? { online: true } : { online: false, reason: 'model' }
}

export const OFFLINE_COPY: Record<'server' | 'model', string> = {
  server: 'The analysis server is not answering, so the engineer cannot read this race. It may be waking up. Check again in a moment.',
  model: 'The analysis server is up, but the engineer\'s language model is not available right now. Answers resume as soon as it is back.',
}
