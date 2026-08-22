import { useEffect, useState } from 'react'

export type ThemePref = 'system' | 'paper' | 'carbon'
export type Theme = 'paper' | 'carbon'

const STORAGE_KEY = 'yoin-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readPref(): ThemePref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'system' || stored === 'paper' || stored === 'carbon') return stored
  } catch {
    return 'system'
  }
  return 'system'
}

function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'carbon' : 'paper'
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  const [systemResolved, setSystemResolved] = useState<Theme>(systemTheme)

  useEffect(() => {
    if (pref !== 'system') return
    const mq = window.matchMedia(DARK_QUERY)
    const sync = () => setSystemResolved(mq.matches ? 'carbon' : 'paper')
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [pref])

  const resolved: Theme = pref === 'system' ? systemResolved : pref

  useEffect(() => {
    const root = document.documentElement
    if (resolved === 'carbon') root.setAttribute('data-theme', 'carbon')
    else root.removeAttribute('data-theme')
  }, [resolved])

  function setPref(next: ThemePref) {
    setPrefState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // storage blocked — pref stays in memory for this session
    }
  }

  return { pref, setPref, resolved }
}
