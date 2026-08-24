import { Capacitor } from '@capacitor/core'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { useEffect, useState } from 'react'
import type { Screen } from '../App'
import { toCsv } from '../data/csv'
import { backupToDisk, getDb, restoreFromDisk } from '../data/db'
import {
  createCategory,
  exportRows,
  listCategories,
  renameCategory,
  setCategoryArchived,
  type Category,
} from '../data/repo'
import type { ThemePref } from '../theme'

const THEME_OPTIONS: ThemePref[] = ['system', 'paper', 'carbon']

const RULE_LEAD = 'mx-2.5 min-w-3.5 flex-1 -translate-y-1 border-b border-dotted border-rule'

const LABEL = 'text-[9.5px] tracking-[.2em] uppercase text-ink-3'

const ROW = 'flex h-[46px] items-center border-b border-dotted border-rule-2'

const FIELD = 'h-9 w-full border-b border-rule bg-transparent font-sans text-[14px] outline-none'

const ACTION =
  'flex h-10 flex-1 items-center justify-center border border-hanko text-[10.5px] font-semibold tracking-[.2em] uppercase text-hanko disabled:border-rule disabled:text-ink-3'

const SEAL =
  'flex h-[34px] w-[34px] shrink-0 rotate-[-3.5deg] items-center justify-center rounded-[3px] border-[1.4px] border-hanko font-serif text-[13px] leading-[1.05] text-hanko shadow-[0_0_0_2.5px_var(--paper),0_0_0_3.5px_color-mix(in_srgb,var(--red)_18%,transparent)] [writing-mode:vertical-rl]'

const VERSION = '0.1.0'

const isWeb = Capacitor.getPlatform() === 'web'

function download(csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'yoin-export.csv'
  anchor.click()
  // revoking in the same tick can cancel the download before the browser reads the blob.
  setTimeout(() => URL.revokeObjectURL(url))
}

function Appearance({
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
      <div className={`mt-3 flex items-baseline ${LABEL}`}>
        <span>Active</span>
        <span className={RULE_LEAD} />
        <span>{resolved}</span>
      </div>
    </div>
  )
}

function CategoryRow({
  category,
  onRename,
  onArchive,
}: {
  category: Category
  onRename: (name: string) => void
  onArchive: (archived: boolean) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  if (category.system) {
    return (
      <div className={ROW}>
        <span className="flex-1 truncate font-sans text-[13.5px] font-medium text-ink-3">
          {category.name}
        </span>
        <span className={LABEL}>Locked</span>
      </div>
    )
  }

  function commit() {
    const name = draft?.trim() ?? ''
    setDraft(null)
    if (name !== '' && name !== category.name) onRename(name)
  }

  return (
    <div className={ROW}>
      {draft === null ? (
        <button
          type="button"
          onClick={() => setDraft(category.name)}
          className={`flex-1 truncate text-left font-sans text-[13.5px] font-medium ${
            category.archived ? 'text-ink-3 line-through' : ''
          }`}
        >
          {category.name}
        </button>
      ) : (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') setDraft(null)
          }}
          className={`flex-1 ${FIELD}`}
        />
      )}
      <button
        type="button"
        onClick={() => onArchive(!category.archived)}
        className={`ml-3 shrink-0 ${LABEL} ${category.archived ? 'text-hanko' : ''}`}
      >
        {category.archived ? 'Restore' : 'Archive'}
      </button>
    </div>
  )
}

function Categories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [draft, setDraft] = useState('')
  const [version, setVersion] = useState(0)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let live = true
    void (async () => {
      const rows = await listCategories(await getDb())
      if (live) setCategories(rows)
    })()
    return () => {
      live = false
    }
  }, [version])

  function mutate(label: string, run: (db: SQLiteDBConnection) => Promise<unknown>) {
    void (async () => {
      setStatus('')
      try {
        await run(await getDb())
      } catch {
        setStatus(`${label} failed`)
      } finally {
        setVersion((current) => current + 1)
      }
    })()
  }

  const trimmed = draft.trim()

  return (
    <div className="pt-6">
      <div className={`flex items-baseline ${LABEL}`}>
        <span>Categories</span>
        <span className={RULE_LEAD} />
        <span>{status === '' ? categories.length : status}</span>
      </div>
      <div className="mt-1.5 border-t border-ink opacity-75" />

      {categories.map((category) => (
        <CategoryRow
          key={category.id}
          category={category}
          onRename={(name) => mutate('Rename', (db) => renameCategory(db, category.id, name))}
          onArchive={(archived) =>
            mutate('Archive', (db) => setCategoryArchived(db, category.id, archived))
          }
        />
      ))}

      <div className="mt-3.5 flex items-end gap-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="New category"
          className={`flex-1 ${FIELD} placeholder:text-ink-3`}
        />
        <button
          type="button"
          disabled={trimmed === ''}
          onClick={() => {
            mutate('Add', (db) => createCategory(db, trimmed))
            setDraft('')
          }}
          className="h-9 shrink-0 px-1 text-[10px] tracking-[.18em] uppercase text-hanko disabled:text-ink-3"
        >
          Add +
        </button>
      </div>
    </div>
  )
}

function Data() {
  const [status, setStatus] = useState('')

  function run(label: string, action: () => Promise<void>) {
    void (async () => {
      setStatus('')
      try {
        await action()
      } catch {
        setStatus(`${label} failed`)
      }
    })()
  }

  if (!isWeb) {
    return (
      <div className="pt-6">
        <div className={`flex items-baseline ${LABEL}`}>
          <span>Data</span>
          <span className={RULE_LEAD} />
          <span>Coming soon</span>
        </div>
        <div className="mt-1.5 border-t border-ink opacity-75" />
        <div className={`flex h-[46px] items-center ${LABEL}`}>
          Export and backup arrive in a later update
        </div>
      </div>
    )
  }

  return (
    <div className="pt-6">
      <div className={`flex items-baseline ${LABEL}`}>
        <span>Data</span>
        <span className={RULE_LEAD} />
        <span>{status === '' ? 'Local only' : status}</span>
      </div>
      <div className="mt-1.5 border-t border-ink opacity-75" />

      <div className="mt-3.5 flex gap-2.5">
        <button
          type="button"
          onClick={() =>
            run('Export', async () => {
              download(toCsv(await exportRows(await getDb())))
            })
          }
          className={ACTION}
        >
          Export CSV
        </button>
        <button type="button" onClick={() => run('Backup', backupToDisk)} className={ACTION}>
          Backup
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!window.confirm('Restore replaces all current data in this app. Continue?')) return
          run('Restore', restoreFromDisk)
        }}
        className="mt-2.5 flex h-10 w-full items-center justify-center border border-dashed border-rule text-[10.5px] tracking-[.2em] uppercase text-ink-2"
      >
        Restore from file
      </button>
    </div>
  )
}

export default function Settings({
  onNavigate,
  pref,
  setPref,
  resolved,
}: {
  onNavigate: (screen: Screen) => void
  pref: ThemePref
  setPref: (next: ThemePref) => void
  resolved: string
}) {
  return (
    <div className="pb-6">
      <Appearance pref={pref} setPref={setPref} resolved={resolved} />

      <Categories />

      <div className="pt-6">
        <button
          type="button"
          onClick={() => onNavigate('accounts')}
          className={`flex w-full items-baseline ${LABEL}`}
        >
          <span>Accounts</span>
          <span className={RULE_LEAD} />
          <span className="text-hanko">Manage →</span>
        </button>
        <div className="mt-1.5 border-t border-ink opacity-75" />
      </div>

      <Data />

      <div className="pt-6">
        <div className={`flex items-baseline ${LABEL}`}>
          <span>About</span>
          <span className={RULE_LEAD} />
          <span className="font-mono tabular-nums">{VERSION}</span>
        </div>
        <div className="mt-3.5 flex items-start gap-3.5 border border-dashed border-rule bg-paper-2 p-[18px]">
          <span className={SEAL}>余韻</span>
          <span>
            <span className="block font-sans text-[12px] font-semibold tracking-[.22em] uppercase">
              Yoin
            </span>
            <span className="mt-2 block font-serif text-[13.5px] leading-[1.75] text-ink-2">
              Everything stays on this device.
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
