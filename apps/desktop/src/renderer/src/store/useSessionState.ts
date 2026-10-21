import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { create } from 'zustand'

// Navigation survives mode switches for this launch only; libraries keep separate contexts.
export const useSessionStore = create<{ values: Record<string, unknown> }>(() => ({ values: {} }))

export function useSessionState<T>(repoRoot: string | null, name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const key = JSON.stringify([repoRoot, name])
  const saved = useSessionStore(state => state.values[key])
  const value = saved === undefined ? initial : saved as T
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(next => {
    useSessionStore.setState(state => {
      const previous = state.values[key] === undefined ? initial : state.values[key] as T
      return { values: { ...state.values, [key]: typeof next === 'function' ? (next as (value: T) => T)(previous) : next } }
    })
  }, [key, initial])
  return [value, setValue]
}
