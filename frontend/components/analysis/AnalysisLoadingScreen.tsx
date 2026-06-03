'use client'

import { useEffect, useState } from 'react'
import { LOADING_STEPS } from '@/lib/constants'

type Props = {
  raceName: string
  sessionKey: number
  currentStep?: number
}

export function AnalysisLoadingScreen({ raceName, sessionKey, currentStep }: Props) {
  // If currentStep is controlled externally (real API), use it; otherwise self-pace
  const [internalStep, setInternalStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [startTime] = useState(() => Date.now())

  const activeStep = currentStep ?? internalStep

  useEffect(() => {
    if (currentStep !== undefined) return // controlled externally
    const id = setInterval(() => {
      setInternalStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1))
    }, 1400)
    return () => clearInterval(id)
  }, [currentStep])

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [startTime])

  const progress = Math.round(((activeStep + 1) / LOADING_STEPS.length) * 100)

  return (
    <div className="min-h-[calc(100vh-48px)] bg-bg-primary flex items-center justify-center relative overflow-hidden">
      {/* Grid background */}
      <div
        className="absolute inset-0 bg-grid-pattern bg-grid opacity-30 pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg px-6">
        {/* Race badge */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-3 px-4 py-2 bg-bg-panel border border-border-subtle rounded-[4px]">
            <div className="w-2 h-2 rounded-full bg-signal-blue animate-pulse" />
            <span className="font-mono text-[11px] text-text-secondary">
              Session {sessionKey}
            </span>
            <span className="text-text-muted font-mono text-[11px]">·</span>
            <span className="font-display font-bold text-[11px] uppercase tracking-[1px] text-text-primary">
              {raceName}
            </span>
          </div>
        </div>

        {/* Title */}
        <h2 className="font-display font-black text-[32px] uppercase tracking-[-0.5px] text-center text-text-primary mb-2">
          Building Race Report
        </h2>
        <p className="text-center font-mono text-[11px] text-text-muted mb-8">
          Fetching and computing 8 strategic modules
        </p>

        {/* Progress bar */}
        <div className="h-[2px] bg-bg-panel border border-border-subtle rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-signal-green transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-2.5 mb-8">
          {LOADING_STEPS.map((step, i) => {
            const done = i < activeStep
            const active = i === activeStep
            const pending = i > activeStep

            return (
              <div key={i} className="flex items-center gap-3">
                {/* Status indicator */}
                <div className="shrink-0 w-4 flex justify-center">
                  {done && <div className="w-2 h-2 rounded-full bg-signal-green" />}
                  {active && <div className="w-2 h-2 rounded-full bg-signal-blue animate-pulse" />}
                  {pending && <div className="w-2 h-2 rounded-full bg-bg-elevated border border-border-default" />}
                </div>

                <span
                  className={`font-mono text-[11px] transition-all duration-300 ${
                    done ? 'text-signal-green' : active ? 'text-text-primary' : 'text-text-muted'
                  }`}
                >
                  {step}
                </span>

                {done && (
                  <span className="ml-auto font-mono text-[10px] text-signal-green">✓</span>
                )}
                {active && (
                  <span className="ml-auto font-mono text-[10px] text-signal-blue animate-pulse">
                    …
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Elapsed timer */}
        <div className="flex items-center justify-between px-3 py-2 bg-bg-panel border border-border-subtle rounded-[3px]">
          <span className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
            Elapsed
          </span>
          <span className="font-mono text-[13px] text-text-secondary tabular-nums">
            {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
            {String(elapsed % 60).padStart(2, '0')}
          </span>
        </div>
      </div>
    </div>
  )
}
