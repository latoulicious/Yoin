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

const AMOUNT = 'text-right font-mono tabular-nums whitespace-nowrap'

const SEC = 'flex h-[22px] items-end text-[9.5px] tracking-[.22em] uppercase text-ink-3'

const FIELD =
  'mt-1.5 h-9 w-full border-b border-rule bg-transparent font-sans text-[14px] outline-none'

const MAX_DIGITS = 11

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
  const [opening, setOpening] = useState(
    account?.openingBalance ? String(account.openingBalance) : '',
  )
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
          <label className="mt-3 block text-[9.5px] tracking-[.2em] uppercase text-ink-3">
            Initial balance
            <input
              value={opening}
              inputMode="numeric"
              onChange={(event) =>
                setOpening(event.target.value.replace(/\D/g, '').slice(0, MAX_DIGITS))
              }
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
          onClick={() =>
            onSave({
              name: trimmed,
              roleNote: roleNote.trim(),
              reserved,
              openingBalance: Number(opening || 0),
            })
          }
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

  const spendable = accounts.filter((a) => !a.reserved)
  const reserved = accounts.filter((a) => a.reserved)
  const ordered = [...spendable, ...reserved]

  function row(account: Account, bordered: boolean) {
    const num = String(ordered.findIndex((a) => a.id === account.id) + 1).padStart(2, '0')
    return (
      <button
        key={account.id}
        type="button"
        onClick={() => setEditing(account)}
        className={`flex h-16 w-full items-center gap-3 text-left ${
          bordered ? 'border-b border-dotted border-rule-2' : ''
        }`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-rule text-[9.5px] tracking-[.06em] text-ink-3">
          {num}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-sans text-[14.5px] font-medium">{account.name}</span>
          {account.roleNote !== '' && (
            <span className="mt-1 block truncate text-[9.5px] tracking-[.14em] uppercase text-ink-3">
              {account.roleNote}
            </span>
          )}
        </span>
        <span className={`${AMOUNT} text-[15px]`}>{plainText(balanceOf(account.id))}</span>
      </button>
    )
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

      <div className={`mt-4 ${SEC}`}>Spendable</div>
      <div className="mt-1.5 border-t border-ink opacity-75" />
      {spendable.map((account) => row(account, true))}
      <div className="mt-3 border-t border-ink opacity-75" />
      <div className="flex items-baseline pt-3">
        <span className="text-[10px] tracking-[.2em] uppercase text-ink-2">Spendable</span>
        <span className={RULE_LEAD} />
        <span className="font-mono text-[15px] font-medium tabular-nums">
          {plainText(summary.spendable)}
        </span>
      </div>

      {reserved.length > 0 && (
        <>
          <div className={`mt-[18px] ${SEC}`}>Reserved</div>
          <div className="mt-1.5 border-t border-ink opacity-75" />
          <div className="-mx-5 mt-2.5 bg-paper-2 px-5 shadow-[inset_3px_0_0_var(--red)]">
            <div className="-mx-5 h-2 [background:repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--red)_24%,transparent)_0_2px,transparent_2px_8px)]" />
            {reserved.map((account) => row(account, false))}
            <div className="flex items-center pb-3.5">
              <span className="inline-block rotate-[-3deg] border border-hanko bg-paper px-1.5 py-[2px] text-[8.5px] font-semibold tracking-[.2em] text-hanko">
                RESERVED
              </span>
              <span className="ml-3 text-[9.5px] tracking-[.2em] uppercase text-ink-3">
                Counted, not spent
              </span>
            </div>
          </div>
          <div className="-mx-5 h-[9px] bg-paper-2 [mask:radial-gradient(circle_at_6px_-1px,transparent_0_6px,#000_6.4px)_repeat-x] [mask-size:12px_9px]" />
        </>
      )}

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="mt-5 flex h-10 w-full items-center justify-center gap-2.5 border border-dashed border-rule text-[10px] tracking-[.2em] uppercase text-ink-2"
      >
        <span>+</span>
        <span>Add account</span>
      </button>

      <div className="mt-4 h-[3px] border-t border-b border-ink opacity-80" />
      <div className="flex items-baseline pt-3">
        <span className="text-[10px] tracking-[.2em] uppercase text-hanko">Total remaining</span>
        <span className={RULE_LEAD} />
        <span className="font-mono text-[19px] font-semibold tabular-nums text-hanko">
          <span className="mr-[.35em] align-[.1em] text-[.6em]">Rp</span>
          {plainText(summary.spendable + summary.reserved)}
        </span>
      </div>
      <div className="mt-2 text-[9.5px] tracking-[.2em] uppercase text-ink-3">
        Spendable + reserved
      </div>

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
