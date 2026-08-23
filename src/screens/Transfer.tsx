import { useEffect, useRef, useState } from 'react'
import { getDb } from '../data/db'
import {
  accountBalances,
  addTransferGroup,
  listAccounts,
  type Account,
  type AccountBalance,
} from '../data/repo'
import type { SavedEntry } from './Record'

type Side = 'from' | 'to'

type Target = 'amount' | 'fee'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'DEL']

const MAX_DIGITS = 11

const RULE_LEAD = 'mx-2.5 min-w-3.5 flex-1 -translate-y-1 border-b border-dotted border-rule'

const AMOUNT = 'text-right font-mono tabular-nums whitespace-nowrap'

function pad(value: number): string {
  return String(value).padStart(2, '0')
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

function plainText(value: number): string {
  return `${value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('en-US')}`
}

function Picker({
  label,
  accounts,
  balanceOf,
  selectedId,
  onSelect,
}: {
  label: string
  accounts: Account[]
  balanceOf: (id: number) => number
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  return (
    <div className="mt-3.5">
      <div className="text-[9.5px] tracking-[.2em] uppercase text-ink-3">{label}</div>
      <div className="mt-1.5 border-t border-dashed border-rule">
        {accounts.map((account) => {
          const active = account.id === selectedId
          return (
            <button
              key={account.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(account.id)}
              className={`flex h-[38px] w-full items-center border-b border-dotted border-rule-2 px-2 text-left ${
                active ? 'bg-hanko-soft shadow-[inset_0_0_0_1px_var(--red)]' : ''
              }`}
            >
              <span
                className={`min-w-0 flex-1 truncate font-sans text-[13px] ${active ? 'font-semibold text-hanko' : 'text-ink-2'}`}
              >
                {account.name}
              </span>
              <span className={`${AMOUNT} text-[12px] text-ink-3`}>
                {plainText(balanceOf(account.id))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function Transfer({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (entry: SavedEntry) => void
}) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [fromId, setFromId] = useState<number | null>(null)
  const [toId, setToId] = useState<number | null>(null)
  const [amountDigits, setAmountDigits] = useState('')
  const [feeDigits, setFeeDigits] = useState('')
  const [target, setTarget] = useState<Target>('amount')
  const saving = useRef(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const db = await getDb()
      const [accountRows, balanceRows] = await Promise.all([listAccounts(db), accountBalances(db)])
      if (!live) return
      setAccounts(accountRows)
      setBalances(balanceRows)
      setFromId(accountRows[0]?.id ?? null)
      setToId(accountRows[1]?.id ?? null)
    })()
    return () => {
      live = false
    }
  }, [])

  const amount = amountDigits === '' ? 0 : Number(amountDigits)
  const fee = feeDigits === '' ? 0 : Number(feeDigits)
  const from = accounts.find((a) => a.id === fromId) ?? null
  const to = accounts.find((a) => a.id === toId) ?? null
  const ready = amount > 0 && from !== null && to !== null && from.id !== to.id

  function balanceOf(id: number): number {
    return balances.find((row) => row.accountId === id)?.balance ?? 0
  }

  function select(side: Side, id: number) {
    if (side === 'from') {
      if (id === toId) setToId(fromId)
      setFromId(id)
      return
    }
    if (id === fromId) setFromId(toId)
    setToId(id)
  }

  async function confirm() {
    if (!ready || from === null || to === null || saving.current) return
    saving.current = true
    try {
      const db = await getDb()
      const groupId = await addTransferGroup(db, {
        fromId: from.id,
        toId: to.id,
        amount,
        fee,
        occurredAt: localIso(new Date()),
      })
      onSaved({ id: 0, groupId, label: `${from.name} → ${to.name}`, amount, kind: 'transfer' })
    } finally {
      saving.current = false
    }
  }

  const fromBalance = from === null ? 0 : balanceOf(from.id)
  const toBalance = to === null ? 0 : balanceOf(to.id)

  return (
    <div className="pt-4 pb-6">
      <div className="flex h-6 items-center">
        <button
          type="button"
          aria-label="Discard transfer"
          onClick={onClose}
          className="-ml-1 px-1 text-[20px] leading-none text-ink-2"
        >
          ×
        </button>
      </div>

      <Picker
        label="From"
        accounts={accounts}
        balanceOf={balanceOf}
        selectedId={fromId}
        onSelect={(id) => select('from', id)}
      />
      <Picker
        label="To"
        accounts={accounts}
        balanceOf={balanceOf}
        selectedId={toId}
        onSelect={(id) => select('to', id)}
      />

      {from?.reserved === true && (
        <div className="mt-2.5 text-[9.5px] tracking-[.2em] uppercase text-hanko">
          reserved — emergency use
        </div>
      )}

      <div className="mt-4 border-t border-ink pt-3.5 pb-3">
        <button
          type="button"
          onClick={() => setTarget('amount')}
          className="flex w-full items-end justify-end gap-2"
        >
          <span className="mr-auto text-[18px] text-ink-3">Rp</span>
          <span className="font-mono text-[38px] font-medium tracking-[-.02em] tabular-nums">
            {amount.toLocaleString('en-US')}
          </span>
          <span
            className={`mb-1 inline-block h-7 w-[2px] ${target === 'amount' ? 'bg-hanko' : 'bg-transparent'}`}
          />
        </button>
        <button
          type="button"
          onClick={() => setTarget('fee')}
          className="mt-2 flex w-full items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3"
        >
          <span>Fee</span>
          <span className={RULE_LEAD} />
          <span className={`font-mono tabular-nums ${target === 'fee' ? 'text-hanko' : ''}`}>
            {fee.toLocaleString('en-US')}
          </span>
        </button>
      </div>
      <div className="border-t border-dashed border-rule" />

      <div className="mt-3 flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
        <span className="truncate">{from?.name ?? '—'}</span>
        <span className={RULE_LEAD} />
        <span className="font-mono tabular-nums">
          {`${plainText(fromBalance)} → ${plainText(fromBalance - amount - fee)}`}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
        <span className="truncate">{to?.name ?? '—'}</span>
        <span className={RULE_LEAD} />
        <span className="font-mono tabular-nums">
          {`${plainText(toBalance)} → ${plainText(toBalance + amount)}`}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 border-t border-l border-dashed border-rule">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() =>
              target === 'amount'
                ? setAmountDigits((current) => nextDigits(current, key))
                : setFeeDigits((current) => nextDigits(current, key))
            }
            className={`flex h-[60px] items-center justify-center border-r border-b border-dashed border-rule ${
              key.length > 1 ? 'text-[12px] tracking-[.14em] text-ink-2' : 'text-[21px]'
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={!ready}
        onClick={() => void confirm()}
        className="mt-4 flex h-10 w-full items-center justify-center border border-hanko text-[10.5px] font-semibold tracking-[.2em] uppercase text-hanko disabled:border-rule disabled:text-ink-3"
      >
        Confirm transfer
      </button>
    </div>
  )
}
