import { useEffect, useRef, useState } from 'react'
import { getDb } from '../data/db'
import {
  createRecurring,
  deleteRecurring,
  listAccounts,
  listCategories,
  listRecurring,
  nextOccurrence,
  startingCursor,
  updateRecurring,
  type Account,
  type Category,
  type RecurringInput,
  type RecurringRule,
} from '../data/repo'

const RULE_LEAD = 'mx-2.5 min-w-3.5 flex-1 -translate-y-1 border-b border-dotted border-rule'

const LABEL = 'text-[9.5px] tracking-[.2em] uppercase text-ink-3'

const FIELD =
  'mt-1.5 h-9 w-full border-b border-rule bg-transparent font-sans text-[14px] outline-none'

const MAX_DIGITS = 11

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDate(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`
}

function Chips<T extends { id: number; name: string }>({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string
  items: T[]
  selected: number | null
  onSelect: (id: number) => void
}) {
  return (
    <div className="mt-3">
      <div className={LABEL}>{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === item.id}
            onClick={() => onSelect(item.id)}
            className={`h-8 px-2.5 text-[10px] tracking-[.14em] uppercase ${
              selected === item.id
                ? 'border border-hanko bg-hanko-soft font-semibold text-hanko'
                : 'border border-dashed border-rule text-ink-2'
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function Editor({
  rule,
  accounts,
  categories,
  onClose,
  onSave,
  onDelete,
}: {
  rule: RecurringRule | null
  accounts: Account[]
  categories: Category[]
  onClose: () => void
  onSave: (input: RecurringInput) => void
  onDelete: () => void
}) {
  const [note, setNote] = useState(rule?.note ?? '')
  const [amount, setAmount] = useState(rule ? String(rule.amount) : '')
  const [day, setDay] = useState(rule ? String(rule.day) : '1')
  const [accountId, setAccountId] = useState(rule?.accountId ?? accounts[0]?.id ?? null)
  const [categoryId, setCategoryId] = useState(
    rule?.categoryId ?? categories.find((c) => c.system)?.id ?? null,
  )
  const trimmed = note.trim()
  const dayNumber = Number(day)
  const validDay = dayNumber >= 1 && dayNumber <= 31
  const valid =
    trimmed !== '' && Number(amount) > 0 && validDay && accountId !== null && categoryId !== null

  let next = ''
  if (validDay) {
    const start = startingCursor(dayNumber, new Date())
    const cursor = rule && rule.lastMonth > start ? rule.lastMonth : start
    next = shortDate(nextOccurrence(cursor, dayNumber))
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-ink/25 px-5" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className="mb-5 max-h-[85dvh] w-full overflow-y-auto border border-ink bg-paper px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"
      >
        <div className="flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
          <span>{rule ? 'Edit recurring' : 'New recurring'}</span>
          <span className={RULE_LEAD} />
          <button type="button" onClick={onClose} className="tracking-[.2em] text-ink-2">
            Close
          </button>
        </div>

        <div className="mt-3.5 border-t border-dashed border-rule pt-3">
          <label className={`block ${LABEL}`}>
            Name
            <input
              value={note}
              placeholder="BCA admin"
              onChange={(event) => setNote(event.target.value)}
              className={`${FIELD} placeholder:text-ink-3`}
            />
          </label>
          <div className="mt-3 flex gap-5">
            <label className={`block flex-1 ${LABEL}`}>
              Amount
              <input
                value={amount}
                inputMode="numeric"
                onChange={(event) =>
                  setAmount(event.target.value.replace(/\D/g, '').slice(0, MAX_DIGITS))
                }
                className={`${FIELD} font-mono tabular-nums`}
              />
            </label>
            <label className={`block w-[92px] ${LABEL}`}>
              Day of month
              <input
                value={day}
                inputMode="numeric"
                onChange={(event) => setDay(event.target.value.replace(/\D/g, '').slice(0, 2))}
                className={`${FIELD} font-mono tabular-nums`}
              />
            </label>
          </div>
          <Chips label="Account" items={accounts} selected={accountId} onSelect={setAccountId} />
          <Chips label="Category" items={categories} selected={categoryId} onSelect={setCategoryId} />
        </div>

        <div className={`mt-3.5 flex items-baseline ${LABEL}`}>
          <span>Next entry</span>
          <span className={RULE_LEAD} />
          <span>{next === '' ? 'Day must be 1–31' : next}</span>
        </div>

        <button
          type="button"
          disabled={!valid}
          onClick={() => {
            if (accountId === null || categoryId === null) return
            onSave({ note: trimmed, amount: Number(amount), categoryId, accountId, day: dayNumber })
          }}
          className="mt-4 flex h-10 w-full items-center justify-center border border-hanko text-[10.5px] font-semibold tracking-[.2em] uppercase text-hanko disabled:border-rule disabled:text-ink-3"
        >
          Save
        </button>
        {rule && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-2.5 flex h-9 w-full items-center justify-center text-[10px] tracking-[.2em] uppercase text-ink-3"
          >
            Delete recurring
          </button>
        )}
      </div>
    </div>
  )
}

export default function Recurring() {
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [editing, setEditing] = useState<RecurringRule | null>(null)
  const [creating, setCreating] = useState(false)
  const [version, setVersion] = useState(0)
  const saving = useRef(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const db = await getDb()
      const [ruleRows, accountRows, categoryRows] = await Promise.all([
        listRecurring(db),
        listAccounts(db),
        listCategories(db),
      ])
      if (!live) return
      setRules(ruleRows)
      setAccounts(accountRows.filter((a) => !a.archived))
      setCategories(categoryRows.filter((c) => c.kind === 'expense' && !c.archived))
    })()
    return () => {
      live = false
    }
  }, [version])

  async function mutate(run: () => Promise<unknown>) {
    if (saving.current) return
    saving.current = true
    try {
      await run()
      setEditing(null)
      setCreating(false)
      setVersion((current) => current + 1)
    } finally {
      saving.current = false
    }
  }

  function save(input: RecurringInput) {
    void mutate(async () => {
      const db = await getDb()
      if (editing) await updateRecurring(db, editing.id, input)
      else await createRecurring(db, input)
    })
  }

  function remove() {
    if (!editing) return
    const { id } = editing
    void mutate(async () => deleteRecurring(await getDb(), id))
  }

  return (
    <div className="pt-5 pb-6">
      <div className={`flex items-baseline ${LABEL}`}>
        <span>Recurring · monthly</span>
        <span className={RULE_LEAD} />
        <span>{rules.length}</span>
      </div>
      <div className="mt-1.5 border-t border-ink opacity-75" />

      {rules.map((rule) => (
        <button
          key={rule.id}
          type="button"
          onClick={() => setEditing(rule)}
          className="flex h-16 w-full items-center gap-3 border-b border-dotted border-rule-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-sans text-[14.5px] font-medium">{rule.note}</span>
            <span className="mt-1 block truncate text-[9.5px] tracking-[.14em] uppercase text-ink-3">
              {`${rule.categoryName} · ${rule.accountName} · ${
                rule.accountArchived
                  ? 'Paused, account archived'
                  : `Next ${shortDate(nextOccurrence(rule.lastMonth, rule.day))}`
              }`}
            </span>
          </span>
          <span className="text-right font-mono text-[15px] whitespace-nowrap tabular-nums">
            {`−${rule.amount.toLocaleString('en-US')}`}
          </span>
        </button>
      ))}

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="mt-5 flex h-10 w-full items-center justify-center gap-2.5 border border-dashed border-rule text-[10px] tracking-[.2em] uppercase text-ink-2"
      >
        <span>+</span>
        <span>Add recurring</span>
      </button>
      <p className="mt-3 text-[11.5px] leading-[1.6] text-ink-3">
        Entries post when Yoin opens on or after the date, with missed months filled in. Short
        months use their last day.
      </p>

      {(editing || creating) && (
        <Editor
          key={editing?.id ?? 'new'}
          rule={editing}
          accounts={accounts}
          categories={categories}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSave={save}
          onDelete={remove}
        />
      )}
    </div>
  )
}
