import { create } from 'zustand'
import type { FullRaceAnalysis } from '@/types'

type AppMode = 'historical' | 'live'

type RaceStore = {
  mode: AppMode
  setMode: (mode: AppMode) => void

  currentSessionKey: number | null
  setCurrentSessionKey: (key: number | null) => void

  analysis: FullRaceAnalysis | null
  setAnalysis: (data: FullRaceAnalysis | null) => void

  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  loadingStep: number
  setLoadingStep: (stepOrUpdater: number | ((prev: number) => number)) => void

  error: string | null
  setError: (error: string | null) => void

  radioOpen: boolean
  setRadioOpen: (open: boolean) => void
}

export const useRaceStore = create<RaceStore>((set, get) => ({
  mode: 'historical',
  setMode: (mode) => set({ mode }),

  currentSessionKey: null,
  setCurrentSessionKey: (key) => set({ currentSessionKey: key }),

  analysis: null,
  setAnalysis: (data) => set({ analysis: data }),

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
}))
