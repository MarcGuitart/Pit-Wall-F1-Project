import { create } from 'zustand'
import type { FullRaceAnalysis } from '@/types'

type AppMode = 'historical' | 'live'
type AnalysisMode = 'strategy' | 'data'
export type ActiveTab = 'strategy' | 'management' | 'weather' | 'telemetry' | 'control'

type FocusedDriver = {
  code: string
  name: string
} | null

type RaceStore = {
  // App-level
  mode: AppMode
  setMode: (mode: AppMode) => void

  // Current session
  currentSessionKey: number | null
  setCurrentSessionKey: (key: number | null) => void

  // Analysis data
  analysis: FullRaceAnalysis | null
  setAnalysis: (data: FullRaceAnalysis | null) => void
  clearAnalysis: () => void

  // Loading state
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  loadingStep: number
  setLoadingStep: (stepOrUpdater: number | ((prev: number) => number)) => void

  // Error
  error: string | null
  setError: (error: string | null) => void

  // Radio overlay
  radioOpen: boolean
  setRadioOpen: (open: boolean) => void

  // V2: analysis view mode (Strategy = default, Data = full tables)
  analysisMode: AnalysisMode
  setAnalysisMode: (mode: AnalysisMode) => void

  // V2: driver focus
  focusedDriver: FocusedDriver
  setFocusedDriver: (code: string, name: string) => void
  clearFocusedDriver: () => void

  // Tab navigation
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void
}

export const useRaceStore = create<RaceStore>((set, get) => ({
  mode: 'historical',
  setMode: (mode) => set({ mode }),

  currentSessionKey: null,
  setCurrentSessionKey: (key) => set({ currentSessionKey: key }),

  analysis: null,
  setAnalysis: (data) => set({ analysis: data }),
  clearAnalysis: () => set({ analysis: null }),

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  loadingStep: 0,
  setLoadingStep: (stepOrUpdater) => {
    const next =
      typeof stepOrUpdater === 'function'
        ? stepOrUpdater(get().loadingStep)
        : stepOrUpdater
    set({ loadingStep: next })
  },

  error: null,
  setError: (error) => set({ error }),

  radioOpen: false,
  setRadioOpen: (open) => set({ radioOpen: open }),

  analysisMode: 'strategy',
  setAnalysisMode: (mode) => set({ analysisMode: mode }),

  focusedDriver: null,
  setFocusedDriver: (code, name) => set({ focusedDriver: { code, name } }),
  clearFocusedDriver: () => set({ focusedDriver: null }),

  activeTab: 'strategy',
  setActiveTab: (tab) => set({ activeTab: tab }),
}))
