import { useEffect, useRef, useState } from 'react'
import { getDb } from '../data/db'
import {
  addTransaction,
  listAccounts,
  listCategories,
  type Account,
  type Category,
} from '../data/repo'

type Kind = 'expense' | 'income'

export interface SavedEntry {
  id: number
  label: string
  amount: number
  kind: Kind | 'transfer'
  groupId?: string
}

const KINDS: Kind[] = ['expense', 'income']

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'DEL']

const MAX_DIGITS = 11

const RULE_LEAD = 'mx-2.5 min-w-3.5 flex-1 -translate-y-1 border-b border-dotted border-rule'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function stampOf(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// schema stores occurred_at as local time without zone; toISOString would shift it to UTC.
function localIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function nextDigits(current: string, key: string): string {
  if (key === 'DEL') return current.slice(0, -1)
  if (key === '000') return current === '' ? '' : (current + '000').slice(0, MAX_DIGITS)
  if (current === '' && key === '0') return ''
  if (current.length >= MAX_DIGITS) return current
  return current + key
}

export default function Record({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (entry: SavedEntry) => void
}) {
  const [kind, setKind] = useState<Kind>('expense')
  const [digits, setDigits] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [stamp] = useState(() => stampOf(new Date()))
  const saving = useRef(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const db = await getDb()
      const [cats, accountRows] = await Promise.all([listCategories(db), listAccounts(db)])
      if (!live) return
      setCategories(cats.filter((c) => !c.system && !c.archived))
      setAccounts(accountRows)
      setAccountId(accountRows[0]?.id ?? null)
    })()
    return () => {
      live = false
    }
  }, [])

  const amount = digits === '' ? 0 : Number(digits)

  async function save(category: Category) {
    if (amount <= 0 || accountId === null || saving.current) return
    saving.current = true
    try {
      const db = await getDb()
      const id = await addTransaction(db, {
        amount,
        kind,
        categoryId: category.id,
        accountId,
        note: '',
        occurredAt: localIso(new Date()),
      })
      onSaved({ id, label: category.name, amount, kind })
    } finally {
      saving.current = false
    }
  }

  return (
    <div className="pt-4">
      <div className="flex h-6 items-center">
        <button
          type="button"
          aria-label="Discard entry"
          onClick={onClose}
          className="-ml-1 px-1 text-[20px] leading-none text-ink-2"
        >
          ×
        </button>
      </div>

      <div className="mt-3.5 flex h-9 border border-rule">
        {KINDS.map((option) => {
          const active = kind === option
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => setKind(option)}
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

      <div className="mt-4 border-t border-ink pt-3.5 pb-3">
        <div className="flex items-end justify-end gap-2">
          <span className="mr-auto text-[18px] text-ink-3">Rp</span>
          <span className="font-mono text-[38px] font-medium tracking-[-.02em] tabular-nums">
            {amount.toLocaleString('en-US')}
          </span>
          <span className="mb-1 inline-block h-7 w-[2px] bg-hanko" />
        </div>
        <div className="mt-2 flex text-[9.5px] tracking-[.2em] uppercase text-ink-3">
          <span>{stamp}</span>
          <span className="ml-auto flex gap-2.5">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                aria-pressed={accountId === account.id}
                onClick={() => setAccountId(account.id)}
                className={accountId === account.id ? 'font-semibold text-hanko' : 'text-ink-3'}
              >
                {account.name}
              </button>
            ))}
          </span>
        </div>
      </div>
      <div className="border-t border-dashed border-rule" />

      <div className="mt-4 grid grid-cols-3 border-t border-l border-dashed border-rule">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setDigits((current) => nextDigits(current, key))}
            className={`flex h-[60px] items-center justify-center border-r border-b border-dashed border-rule ${
              key.length > 1 ? 'text-[12px] tracking-[.14em] text-ink-2' : 'text-[21px]'
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="mt-3.5 flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
        <span>Tap a category to save</span>
        <span className={RULE_LEAD} />
        <span>1 tap</span>
      </div>

      <div className="mt-1.5 grid grid-cols-3 border-t border-l border-dashed border-rule">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => void save(category)}
            className="flex h-[70px] flex-col items-center justify-center gap-[7px] border-r border-b border-dashed border-rule"
          >
            <span className="flex h-7 w-7 items-center justify-center border border-rule text-[9.5px] tracking-[.06em] text-ink-3">
              {category.code}
            </span>
            <span className="font-sans text-[12.5px] font-medium text-ink-2">{category.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
