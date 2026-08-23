import { useEffect, useState } from 'react'
import { getDb } from '../data/db'
import {
  dayGroups,
  deleteTransaction,
  listAccounts,
  monthTotals,
  type Account,
  type DayGroup,
  type MonthTotals,
  type Transaction,
} from '../data/repo'

const RULE_LEAD = 'mx-2.5 min-w-3.5 flex-1 -translate-y-1 border-b border-dotted border-rule'

const PERF =
  '-mx-5 h-[9px] bg-repeat-x opacity-50 [background-image:radial-gradient(circle_at_5px_4.5px,var(--rule)_0_2.1px,transparent_2.4px)] [background-size:10px_9px]'

const AMOUNT = 'text-right font-mono tabular-nums whitespace-nowrap'

const KIND_LABEL: Record<Transaction['kind'], string> = {
  expense: 'Expense',
  income: 'Income',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  fee: 'Fee',
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

// 'YYYY-MM-DD' through the Date constructor parses as UTC and can slip a day.
function dateOf(day: string): Date {
  return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
}

function shiftMonth(month: string, delta: number): string {
  return monthKey(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1))
}

function monthLabel(month: string): string {
  const date = dateOf(`${month}-01`)
  return `${date.toLocaleDateString('en-US', { month: 'long' })} ${date.getFullYear()}`
}

function dayLabel(day: string): string {
  const date = dateOf(day)
  return `${date.toLocaleDateString('en-US', { month: 'short' })} ${date.getDate()} · ${date.toLocaleDateString('en-US', { weekday: 'short' })}`
}

function signedText(value: number): string {
  if (value === 0) return '0'
  return `${value < 0 ? '−' : '+'}${Math.abs(value).toLocaleString('en-US')}`
}

function signedOf(txn: Transaction): number {
  return txn.kind === 'income' || txn.kind === 'transfer_in' ? txn.amount : -txn.amount
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2.5 flex items-baseline text-[10px] tracking-[.16em] uppercase text-ink-2">
      <span className="text-ink-3">{label}</span>
      <span className={RULE_LEAD} />
      <span>{value}</span>
    </div>
  )
}

function Detail({
  txn,
  accountName,
  onClose,
  onDelete,
}: {
  txn: Transaction
  accountName: string
  onClose: () => void
  onDelete: () => void
}) {
  const value = signedOf(txn)
  return (
    <div className="fixed inset-0 z-10 flex items-end bg-ink/25 px-5" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className="mb-5 w-full border border-ink bg-paper px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"
      >
        <div className="flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
          <span>Entry</span>
          <span className={RULE_LEAD} />
          <button type="button" onClick={onClose} className="tracking-[.2em] text-ink-2">
            Close
          </button>
        </div>

        <div className="mt-2 flex items-end justify-between gap-3">
          <span className="font-sans text-[15px] font-medium">
            {txn.categoryName ?? 'Uncategorized'}
          </span>
          <span className={`${AMOUNT} text-[20px] ${value < 0 ? '' : 'font-semibold'}`}>
            {signedText(value)}
          </span>
        </div>

        <div className="mt-3.5 border-t border-dashed border-rule" />
        <Field label="Kind" value={KIND_LABEL[txn.kind]} />
        <Field label="Account" value={accountName} />
        <Field
          label="When"
          value={`${dayLabel(txn.occurredAt.slice(0, 10))} · ${txn.occurredAt.slice(11, 16)}`}
        />
        {txn.note !== '' && <Field label="Note" value={txn.note} />}

        <button
          type="button"
          onClick={onDelete}
          className="mt-4 flex h-10 w-full items-center justify-center border border-hanko text-[10.5px] font-semibold tracking-[.2em] uppercase text-hanko"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

export default function History() {
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const [totals, setTotals] = useState<MonthTotals>({ income: 0, expense: 0 })
  const [groups, setGroups] = useState<DayGroup[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    void (async () => {
      const db = await getDb()
      const [monthly, days, accountRows] = await Promise.all([
        monthTotals(db, month),
        dayGroups(db, month),
        listAccounts(db),
      ])
      if (!live) return
      setTotals(monthly)
      setGroups(days)
      setAccounts(accountRows)
    })()
    return () => {
      live = false
    }
  }, [month, version])

  async function remove(id: number) {
    const db = await getDb()
    await deleteTransaction(db, id)
    setSelected(null)
    setVersion((current) => current + 1)
  }

  const net = totals.income - totals.expense
  const cells = [
    { label: 'In', value: signedText(totals.income), strong: true },
    { label: 'Out', value: signedText(-totals.expense), strong: false },
    { label: 'Net', value: signedText(net), strong: net >= 0 },
  ]

  return (
    <div className="pt-1 pb-6">
      <div className="flex h-11 items-center border-b border-dashed border-rule">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="w-[26px] text-[15px] text-ink-2"
        >
          ‹
        </button>
        <span className="flex-1 text-center font-sans text-[12px] font-semibold tracking-[.24em] uppercase">
          {monthLabel(month)}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="w-[26px] text-[15px] text-ink-2"
        >
          ›
        </button>
      </div>

      <div className="flex pt-3.5 pb-4">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="flex-1 border-l border-dotted border-rule pl-3.5 first:border-l-0 first:pl-0"
          >
            <div className="text-[9.5px] tracking-[.2em] uppercase text-ink-3">{cell.label}</div>
            <div
              className={`mt-[5px] font-mono text-[14px] tabular-nums ${cell.strong ? 'font-semibold' : ''}`}
            >
              {cell.value}
            </div>
          </div>
        ))}
      </div>

      <div className={PERF} />

      {groups.length === 0 ? (
        <div className="flex h-[52px] items-center text-[10px] tracking-[.18em] uppercase text-ink-3">
          No entries this month
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.date}>
            <div className="mt-3.5 flex h-[22px] items-baseline">
              <span className="text-[10px] tracking-[.2em] uppercase text-ink-2">
                {dayLabel(group.date)}
              </span>
              <span className="ml-auto text-[10px] tracking-[.1em] text-ink-3">
                {signedText(group.subtotal)}
              </span>
            </div>
            <div className="border-t border-ink opacity-75" />
            {group.rows.map((txn) => {
              const value = signedOf(txn)
              return (
                <button
                  key={txn.id}
                  type="button"
                  onClick={() => setSelected(txn)}
                  className="flex h-[52px] w-full items-center border-b border-dotted border-rule-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans text-[14.5px] font-medium">
                      {txn.categoryName ?? 'Uncategorized'}
                    </span>
                    <span className="mt-[3px] block text-[10px] tracking-[.09em] uppercase text-ink-3">
                      <span className="mr-[7px] inline-block border border-rule px-1 py-px align-[1px] text-[9px] tracking-[.1em]">
                        {txn.categoryCode ?? '··'}
                      </span>
                      {txn.occurredAt.slice(11, 16)}
                    </span>
                  </span>
                  <span className={`${AMOUNT} text-[14.5px] ${value < 0 ? '' : 'font-semibold'}`}>
                    {signedText(value)}
                  </span>
                </button>
              )
            })}
          </div>
        ))
      )}

      {selected && (
        <Detail
          txn={selected}
          accountName={accounts.find((a) => a.id === selected.accountId)?.name ?? '—'}
          onClose={() => setSelected(null)}
          onDelete={() => void remove(selected.id)}
        />
      )}
    </div>
  )
}
