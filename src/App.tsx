import { useEffect, useRef, useState } from 'react'
import { getDb } from './data/db'
import { deleteTransaction, deleteTransferGroup } from './data/repo'
import Accounts from './screens/Accounts'
import History from './screens/History'
import Home from './screens/Home'
import Insights from './screens/Insights'
import Record, { type SavedEntry } from './screens/Record'
import Settings, { Appearance, Categories } from './screens/Settings'
import Transfer from './screens/Transfer'
import { useTheme } from './theme'

export type Screen =
  | 'home'
  | 'history'
  | 'record'
  | 'insights'
  | 'accounts'
  | 'transfer'
  | 'settings'
  | 'appearance'
  | 'categories'

const SCREEN_LABEL: Record<Screen, string> = {
  home: 'Ledger',
  history: 'History',
  record: 'Record',
  insights: 'Insights',
  accounts: 'Accounts',
  transfer: 'Transfer',
  settings: 'Settings',
  appearance: 'Appearance',
  categories: 'Categories',
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

const UNDO_WINDOW_MS = 5000

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [lastEntry, setLastEntry] = useState<SavedEntry | null>(null)
  const [dataVersion, setDataVersion] = useState(0)
  const undoTimer = useRef<number | undefined>(undefined)
  const { pref, setPref, resolved } = useTheme()

  useEffect(() => () => clearTimeout(undoTimer.current), [])

  function handleSaved(entry: SavedEntry) {
    clearTimeout(undoTimer.current)
    setLastEntry(entry)
    setDataVersion((current) => current + 1)
    setScreen(entry.kind === 'transfer' ? 'accounts' : 'home')
    undoTimer.current = window.setTimeout(() => setLastEntry(null), UNDO_WINDOW_MS)
  }

  async function undo(entry: SavedEntry) {
    clearTimeout(undoTimer.current)
    const db = await getDb()
    if (entry.groupId !== undefined) await deleteTransferGroup(db, entry.groupId)
    else await deleteTransaction(db, entry.id)
    setLastEntry((current) => (current === entry ? null : current))
    setDataVersion((current) => current + 1)
  }

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
          <Settings onNavigate={setScreen} />
        ) : screen === 'appearance' ? (
          <Appearance pref={pref} setPref={setPref} resolved={resolved} />
        ) : screen === 'categories' ? (
          <Categories />
        ) : screen === 'record' ? (
          <Record
            onClose={() => setScreen('home')}
            onSaved={handleSaved}
            onTransfer={() => setScreen('transfer')}
          />
        ) : screen === 'home' ? (
          <Home key={dataVersion} onNavigate={setScreen} />
        ) : screen === 'history' ? (
          <History key={dataVersion} />
        ) : screen === 'insights' ? (
          <Insights key={dataVersion} />
        ) : screen === 'accounts' ? (
          <Accounts key={dataVersion} onTransfer={() => setScreen('transfer')} />
        ) : (
          <Transfer onClose={() => setScreen('accounts')} onSaved={handleSaved} />
        )}
      </main>

      {lastEntry && (
        <div className="mx-5 flex h-[38px] items-center border-t border-dashed border-rule pt-2.5 text-[10px] tracking-[.12em] uppercase text-ink-3">
          <span>
            {`Last · ${lastEntry.label} ${lastEntry.kind === 'income' ? '+' : '−'}${lastEntry.amount.toLocaleString('en-US')}`}
          </span>
          <button
            type="button"
            onClick={() => void undo(lastEntry)}
            className="ml-auto font-semibold tracking-[.2em] text-hanko"
          >
            UNDO
          </button>
        </div>
      )}

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
