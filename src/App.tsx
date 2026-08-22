import { useState } from 'react'
import { useTheme, type ThemePref } from './theme'

type Screen = 'home' | 'history' | 'record' | 'insights' | 'settings'

const SCREEN_LABEL: Record<Screen, string> = {
  home: 'Ledger',
  history: 'History',
  record: 'Record',
  insights: 'Insights',
  settings: 'Settings',
}

const THEME_OPTIONS: ThemePref[] = ['system', 'paper', 'carbon']

const RULE_LEAD = 'mx-2.5 min-w-3.5 flex-1 -translate-y-1 border-b border-dotted border-rule'

function Placeholder({ label }: { label: string }) {
  return (
    <div className="pt-5">
      <div className="flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
        <span>{label}</span>
        <span className={RULE_LEAD} />
        <span>Placeholder</span>
      </div>
      <div className="mt-4 border-t border-dashed border-rule" />
    </div>
  )
}

function ThemeSetting({
  pref,
  setPref,
  resolved,
}: {
  pref: ThemePref
  setPref: (next: ThemePref) => void
  resolved: string
}) {
  return (
    <div className="pt-5">
      <div className="flex h-[22px] items-end text-[9.5px] tracking-[.22em] uppercase text-ink-3">
        Appearance
      </div>
      <div className="mt-2.5 flex h-10 border border-rule">
        {THEME_OPTIONS.map((option) => {
          const active = pref === option
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => setPref(option)}
              className={`flex flex-1 items-center justify-center border-l border-dashed border-rule text-[10.5px] tracking-[.2em] uppercase first:border-l-0 ${
                active
                  ? 'bg-hanko-soft font-semibold text-hanko shadow-[inset_0_0_0_1px_var(--red)]'
                  : 'text-ink-3'
              }`}
            >
              {option}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
        <span>Active</span>
        <span className={RULE_LEAD} />
        <span>{resolved}</span>
      </div>
    </div>
  )
}

function NavTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={`flex-1 pt-1.5 text-center text-[9px] tracking-[.16em] uppercase ${
        active ? 'text-ink' : 'text-ink-3'
      }`}
    >
      {label}
      <span
        className={`mx-auto mt-1.5 block h-[1.5px] w-6 ${active ? 'bg-hanko' : 'bg-transparent'}`}
      />
    </button>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const { pref, setPref, resolved } = useTheme()

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <header className="border-b border-dashed border-rule pt-[env(safe-area-inset-top)]">
        <div className="flex h-[52px] items-center gap-3 px-5">
          <span className="font-sans text-[12px] font-semibold tracking-[.22em] uppercase">
            Yoin
          </span>
          <span className="text-[10px] tracking-[.14em] uppercase text-ink-3">
            {SCREEN_LABEL[screen]}
          </span>
          <span className="ml-auto flex h-[34px] w-[34px] rotate-[-3.5deg] items-center justify-center rounded-[3px] border-[1.4px] border-hanko font-serif text-[13px] leading-[1.05] text-hanko shadow-[0_0_0_2.5px_var(--paper),0_0_0_3.5px_color-mix(in_srgb,var(--red)_18%,transparent)] [writing-mode:vertical-rl]">
            余韻
          </span>
        </div>
      </header>

      <main className="flex-1 px-5">
        {screen === 'settings' ? (
          <ThemeSetting pref={pref} setPref={setPref} resolved={resolved} />
        ) : (
          <Placeholder label={SCREEN_LABEL[screen]} />
        )}
      </main>

      <nav className="border-t border-dashed border-rule pb-[env(safe-area-inset-bottom)]">
        <div className="flex h-[78px] items-center px-3.5 pb-3">
          <NavTab label="Home" active={screen === 'home'} onClick={() => setScreen('home')} />
          <NavTab
            label="History"
            active={screen === 'history'}
            onClick={() => setScreen('history')}
          />
          <button
            type="button"
            aria-label="Record entry"
            aria-current={screen === 'record' ? 'page' : undefined}
            onClick={() => setScreen('record')}
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-hanko pb-[3px] text-2xl leading-none text-hanko shadow-[0_0_0_3px_var(--paper),0_0_0_4.5px_color-mix(in_srgb,var(--red)_30%,transparent)]"
          >
            +
          </button>
          <NavTab
            label="Insights"
            active={screen === 'insights'}
            onClick={() => setScreen('insights')}
          />
          <NavTab
            label="Settings"
            active={screen === 'settings'}
            onClick={() => setScreen('settings')}
          />
        </div>
      </nav>
    </div>
  )
}
