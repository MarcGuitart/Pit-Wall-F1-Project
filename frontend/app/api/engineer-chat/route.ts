import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { FullRaceAnalysis } from '@/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

function buildSystemPrompt(ctx: FullRaceAnalysis): string {
  const race = ctx.race
  const chaos = ctx.chaos

  // Top 5 pace ranking
  const top5 = ctx.true_pace
    .slice(0, 5)
    .map(
      (d) =>
        `  P${d.rank} ${d.driver_code} (${d.team_name ?? 'unknown team'}): ` +
        `clean pace ${d.clean_pace.toFixed(3)}s, median ${d.median_lap.toFixed(3)}s, ` +
        `${d.sample_size} laps, ${d.confidence} confidence, traffic delta +${d.traffic_score.toFixed(3)}s`
    )
    .join('\n')

  // Tyre degradation — worst cliffs first
  const tyreLines = ctx.tyre_degradation
    .slice()
    .sort((a, b) => b.degradation_slope - a.degradation_slope)
    .slice(0, 10)
    .map(
      (s) =>
        `  ${s.driver_code} Stint ${s.stint_number} ${s.compound} ` +
        `L${s.lap_start}–${s.lap_end}: slope ${s.degradation_slope > 0 ? '+' : ''}${s.degradation_slope.toFixed(3)}s/lap, ` +
        `cliff risk ${s.cliff_risk}, ${s.confidence} confidence`
    )
    .join('\n')

  // Pit stops — include all with valid stop duration
  const pitLines = ctx.pit_impact
    .filter((p) => p.stop_duration && p.stop_duration > 0.5)
    .map(
      (p) =>
        `  ${p.driver_code} L${p.lap_number}: lane ${p.lane_duration?.toFixed(1) ?? '–'}s, ` +
        `stop ${p.stop_duration?.toFixed(1) ?? '–'}s, ` +
        `P${p.position_before ?? '?'} → P${p.position_after ?? '?'} ` +
        `(net ${p.net_position_change != null ? (p.net_position_change >= 0 ? '+' : '') + p.net_position_change : '–'})`
    )
    .join('\n')

  // Engineer notes as bullet list
  const noteLines = ctx.engineer_notes
    .map((n) => `  • [${n.type}] L${n.lap_number ?? '?'} — ${n.title}: ${n.message}`)
    .join('\n')

  // Key decisions
  const decisionLines = ctx.decisions
    .slice(0, 3)
    .map((d) => `  ${d.rank}. ${d.title} — ${d.impact}. ${d.explanation}`)
    .join('\n')

  // Chaos breakdown
  const chaosComponents = Object.entries(chaos.components)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}pts`)
    .join(', ')

  return `You are the race engineer for the ${race.meeting_name} ${race.year} ${race.session_name}.
You have full access to the computed race analysis data below. Answer like a pit wall engineer: direct, technical, concise. Cite specific laps and data. 2–4 sentences max. Never invent data not present below. If asked about something not in the data, say so clearly.

RACE: ${race.meeting_name} ${race.year} — ${race.circuit_short_name ?? 'unknown circuit'}
CHAOS INDEX: ${chaos.score}/100 (${chaos.level})
Peak chaos lap: ${chaos.peak_chaos_lap ?? 'N/A'}
Components: ${chaosComponents}
Summary: ${chaos.summary}

STRATEGIC OVERVIEW:
Phase: ${ctx.race_brain.race_phase}
Key question: ${ctx.race_brain.main_question}
Tension: ${ctx.race_brain.strategic_tension}
Best compound: ${ctx.race_brain.best_compound ?? 'N/A'}
${ctx.race_brain.summary}

TRUE PACE RANKING (clean laps, SC/VSC/pit filtered):
${top5}

TYRE DEGRADATION (top 10 by slope):
${tyreLines}

PIT STOPS:
${pitLines || '  No valid pit stop data.'}

ENGINEER NOTES (${ctx.engineer_notes.length} total):
${noteLines || '  No notes generated.'}

KEY DECISIONS:
${decisionLines}

INSTRUCTION: Answer in 2–4 sentences. Be direct. Cite laps and driver codes. No markdown. If no relevant data exists, say "No data for that in this session."`
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      question: string
      session_key: number
      race_context: FullRaceAnalysis
    }

    if (!body.question?.trim()) {
      return NextResponse.json({ error: 'No question provided' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      // Graceful demo mode — no API key configured
      const ctx = body.race_context
      return NextResponse.json({
        answer:
          `[Demo mode — configure ANTHROPIC_API_KEY in .env.local to enable live answers.] ` +
          `${ctx.race.meeting_name} ${ctx.race.year}: chaos ${ctx.chaos.score}/100 (${ctx.chaos.level}). ` +
          `${ctx.race_brain.summary.slice(0, 150)}`,
      })
    }

    const systemPrompt = buildSystemPrompt(body.race_context)

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: body.question.trim() }],
    })

    const answer =
      response.content[0].type === 'text'
        ? response.content[0].text.trim()
        : 'No response received.'

    return NextResponse.json({ answer })
  } catch (err) {
    console.error('[engineer-chat]', err)
    return NextResponse.json(
      { answer: 'Radio signal lost. Try again.' },
      { status: 500 }
    )
  }
}
