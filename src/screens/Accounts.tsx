import { useEffect, useRef, useState } from 'react'
import { getDb } from '../data/db'
import {
  accountBalances,
  balanceSummary,
  createAccount,
  listAccounts,
  updateAccount,
  type Account,
  type AccountBalance,
  type AccountInput,
  type BalanceSummary,
} from '../data/repo'

const RULE_LEAD = 'mx-2.5 min-w-3.5 flex-1 -translate-y-1 border-b border-dotted border-rule'

const PERF =
  '-mx-5 h-[9px] bg-repeat-x opacity-50 [background-image:radial-gradient(circle_at_5px_4.5px,var(--rule)_0_2.1px,transparent_2.4px)] [background-size:10px_9px]'

const AMOUNT = 'text-right font-mono tabular-nums whitespace-nowrap'

const FIELD =
  'mt-1.5 h-9 w-full border-b border-rule bg-transparent font-sans text-[14px] outline-none'

const ROLES: { value: boolean; label: string }[] = [
  { value: false, label: 'Spendable' },
  { value: true, label: 'Reserved' },
]

function plainText(value: number): string {
  return `${value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('en-US')}`
}

function Editor({
  account,
  onClose,
  onSave,
}: {
  account: Account | null
  onClose: () => void
  onSave: (input: AccountInput) => void
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [roleNote, setRoleNote] = useState(account?.roleNote ?? '')
  const [reserved, setReserved] = useState(account?.reserved ?? false)
  const trimmed = name.trim()

  return (
    <div className="fixed inset-0 z-10 flex items-end bg-ink/25 px-5" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className="mb-5 w-full border border-ink bg-paper px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"
      >
        <div className="flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
          <span>{account ? 'Edit account' : 'New account'}</span>
          <span className={RULE_LEAD} />
          <button type="button" onClick={onClose} className="tracking-[.2em] text-ink-2">
            Close
          </button>
        </div>

        <div className="mt-3.5 border-t border-dashed border-rule pt-3">
          <label className="block text-[9.5px] tracking-[.2em] uppercase text-ink-3">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={FIELD}
            />
          </label>
          <label className="mt-3 block text-[9.5px] tracking-[.2em] uppercase text-ink-3">
            Role note
            <input
              value={roleNote}
              onChange={(event) => setRoleNote(event.target.value)}
              className={FIELD}
            />
          </label>
        </div>

        <div className="mt-4 flex h-9 border border-rule">
          {ROLES.map((role) => {
            const active = reserved === role.value
            return (
              <button
                key={role.label}
                type="button"
                aria-pressed={active}
                onClick={() => setReserved(role.value)}
                className={`flex flex-1 items-center justify-center border-l border-dashed border-rule text-[10.5px] tracking-[.2em] uppercase first:border-l-0 ${
                  active
                    ? 'bg-hanko-soft font-semibold text-hanko shadow-[inset_0_0_0_1px_var(--red)]'
                    : 'text-ink-3'
                }`}
              >
                {role.label}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          disabled={trimmed === ''}
          onClick={() => onSave({ name: trimmed, roleNote: roleNote.trim(), reserved })}
          className="mt-4 flex h-10 w-full items-center justify-center border border-hanko text-[10.5px] font-semibold tracking-[.2em] uppercase text-hanko disabled:border-rule disabled:text-ink-3"
        >
          Save
        </button>
      </div>
    </div>
  )
}

export default function Accounts({ onTransfer }: { onTransfer: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [summary, setSummary] = useState<BalanceSummary>({ spendable: 0, reserved: 0 })
  const [editing, setEditing] = useState<Account | null>(null)
  const [creating, setCreating] = useState(false)
  const [version, setVersion] = useState(0)
  const saving = useRef(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const db = await getDb()
      const [accountRows, balanceRows, totals] = await Promise.all([
        listAccounts(db),
        accountBalances(db),
        balanceSummary(db),
      ])
      if (!live) return
      setAccounts(accountRows)
      setBalances(balanceRows)
      setSummary(totals)
    })()
    return () => {
      live = false
    }
  }, [version])

  async function save(input: AccountInput) {
    if (saving.current) return
    saving.current = true
    try {
      const db = await getDb()
      if (editing) await updateAccount(db, editing.id, input)
      else await createAccount(db, input)
      setEditing(null)
      setCreating(false)
      setVersion((current) => current + 1)
    } finally {
      saving.current = false
    }
  }

  function balanceOf(id: number): number {
    return balances.find((row) => row.accountId === id)?.balance ?? 0
  }

  return (
    <div className="pt-5 pb-6">
      <div className="flex items-baseline text-[10px] tracking-[.2em] uppercase text-ink-3">
        <span>Accounts</span>
        <span className={RULE_LEAD} />
        {accounts.length > 1 && (
          <button type="button" onClick={onTransfer} className="tracking-[.2em] text-hanko">
            Transfer →
          </button>
        )}
      </div>

      <div className="mt-[18px]">
        <span className="block text-[9.5px] tracking-[.2em] uppercase text-ink-3">Total</span>
        <span className="mt-0.5 block font-mono text-[32px] font-medium tracking-[-.02em] tabular-nums">
          <span className="mr-[.4em] align-[.12em] text-[.58em] text-ink-3">Rp</span>
          {plainText(summary.spendable + summary.reserved)}
        </span>
        <span className="mt-2 flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
          <span>Spendable</span>
          <span className={RULE_LEAD} />
          <span className="font-mono tabular-nums">{plainText(summary.spendable)}</span>
        </span>
        <span className="mt-1.5 flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
          <span>Reserved</span>
          <span className={RULE_LEAD} />
          <span className="font-mono tabular-nums">{plainText(summary.reserved)}</span>
        </span>
      </div>

      <div className={`${PERF} mt-4`} />

      <div className="mt-3.5 border-t border-ink opacity-75" />

      {accounts.map((account) => (
        <button
          key={account.id}
          type="button"
          onClick={() => setEditing(account)}
          className="flex h-[58px] w-full items-center border-b border-dotted border-rule-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-sans text-[14.5px] font-medium">{account.name}</span>
            <span className="mt-[3px] block truncate text-[9.5px] tracking-[.18em] uppercase text-ink-3">
              {account.reserved ? (
                <span className="text-hanko">reserved — emergency use</span>
              ) : (
                account.roleNote
              )}
            </span>
          </span>
          <span className={`${AMOUNT} text-[14.5px]`}>{plainText(balanceOf(account.id))}</span>
        </button>
      ))}

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="mt-4 flex w-full items-baseline text-[10px] tracking-[.18em] uppercase text-ink-2"
      >
        <span>Add account</span>
        <span className={RULE_LEAD} />
        <span>+</span>
      </button>

      {(editing || creating) && (
        <Editor
          key={editing?.id ?? 'new'}
          account={editing}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSave={(input) => void save(input)}
        />
      )}
    </div>
  )
}
