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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dateLabel(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`
}

function PickRow({
  label,
  account,
  before,
  after,
  onClick,
}: {
  label: string
  account: Account | null
  before: number
  after: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[54px] w-full items-center border border-rule bg-paper-2 px-3.5 text-left"
    >
      <span className="w-11 shrink-0 text-[9px] tracking-[.22em] uppercase text-ink-3">{label}</span>
      <span className="min-w-0 flex-1 border-l border-dotted border-rule pl-3.5">
        <span className="block truncate font-sans text-[13.5px] font-medium">
          {account?.name ?? '—'}
        </span>
        <span className="mt-[3px] block truncate font-mono text-[9.5px] tracking-[.12em] text-ink-3">
          {account === null
            ? 'CHOOSE ACCOUNT'
            : `BALANCE ${plainText(before)} → ${plainText(after)}`}
        </span>
      </span>
      <span className="ml-2.5 shrink-0 text-[13px] text-rule">›</span>
    </button>
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
  const [picking, setPicking] = useState<Side | null>(null)
  const [stamp] = useState(() => dateLabel(new Date()))
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
  const pickerOptions = picking === 'to' ? accounts.filter((a) => a.id !== fromId) : accounts

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
        <span className="ml-auto text-[9.5px] tracking-[.2em] uppercase text-ink-3">{stamp}</span>
      </div>

      <div className="mt-3.5">
        <PickRow
          label="From"
          account={from}
          before={fromBalance}
          after={fromBalance - amount - fee}
          onClick={() => setPicking('from')}
        />
        <div className="flex h-7 items-center">
          <span className="flex-1 border-t border-dashed border-rule" />
          <button
            type="button"
            aria-label="Swap accounts"
            onClick={() => {
              setFromId(toId)
              setToId(fromId)
            }}
            className="mx-3 flex h-7 w-7 items-center justify-center border border-hanko bg-paper text-[13px] text-hanko"
          >
            ⇄
          </button>
          <span className="flex-1 border-t border-dashed border-rule" />
        </div>
        <PickRow
          label="To"
          account={to}
          before={toBalance}
          after={toBalance + amount}
          onClick={() => setPicking('to')}
        />
      </div>

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
        className="mt-5 flex h-[52px] w-full items-center justify-center border-[1.5px] border-hanko bg-hanko-soft text-[11.5px] font-semibold tracking-[.26em] uppercase text-hanko shadow-[0_0_0_3px_var(--paper),0_0_0_4.5px_color-mix(in_srgb,var(--red)_35%,transparent)] disabled:border-rule disabled:bg-transparent disabled:text-ink-3 disabled:shadow-none"
      >
        Confirm transfer
      </button>

      {picking && (
        <div
          className="fixed inset-0 z-10 flex items-end bg-ink/25 px-5"
          onClick={() => setPicking(null)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="mb-5 w-full border border-ink bg-paper px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"
          >
            <div className="flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
              <span>{picking === 'from' ? 'From account' : 'To account'}</span>
              <span className={RULE_LEAD} />
              <button
                type="button"
                onClick={() => setPicking(null)}
                className="tracking-[.2em] text-ink-2"
              >
                Close
              </button>
            </div>
            <div className="mt-3 border-t border-dashed border-rule">
              {pickerOptions.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => {
                    select(picking, account.id)
                    setPicking(null)
                  }}
                  className="flex h-12 w-full items-center gap-2.5 border-b border-dotted border-rule-2 text-left"
                >
                  <span className="min-w-0 flex-1 truncate font-sans text-[13.5px] font-medium">
                    {account.name}
                  </span>
                  {account.reserved && (
                    <span className="shrink-0 border border-hanko px-1 text-[8.5px] tracking-[.18em] text-hanko">
                      RESERVED
                    </span>
                  )}
                  <span className={`${AMOUNT} text-[12.5px] text-ink-3`}>
                    {plainText(balanceOf(account.id))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
