import { useEffect, useState } from 'react'
import { getDb } from '../data/db'
import {
  balanceSummary,
  dayGroups,
  monthTotals,
  type BalanceSummary,
  type DayGroup,
  type MonthTotals,
  type Transaction,
} from '../data/repo'

type NavTarget = 'history' | 'insights' | 'accounts'

const RULE_LEAD = 'mx-2.5 min-w-3.5 flex-1 -translate-y-1 border-b border-dotted border-rule'

const PERF =
  '-mx-5 h-[9px] bg-repeat-x opacity-50 [background-image:radial-gradient(circle_at_5px_4.5px,var(--rule)_0_2.1px,transparent_2.4px)] [background-size:10px_9px]'

const TEAR =
  '-mx-5 h-[9px] bg-paper-2 [mask-image:radial-gradient(circle_at_6px_-1px,transparent_0_6px,#000_6.4px)] [mask-repeat:repeat-x] [mask-size:12px_9px]'

const AMOUNT = 'text-right font-mono tabular-nums whitespace-nowrap'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function dayKey(date: Date): string {
  return `${monthKey(date)}-${pad(date.getDate())}`
}

function pad3(value: number): string {
  return String(value).padStart(3, '0')
}

function grouped(value: number): string {
  return Math.abs(value).toLocaleString('en-US')
}

function signedText(value: number): string {
  if (value === 0) return '0'
  return `${value < 0 ? '−' : '+'}${grouped(value)}`
}

function plainText(value: number): string {
  return `${value < 0 ? '−' : ''}${grouped(value)}`
}

function signedOf(txn: Transaction): number {
  return txn.kind === 'income' || txn.kind === 'transfer_in' ? txn.amount : -txn.amount
}

function Row({ txn }: { txn: Transaction }) {
  const value = signedOf(txn)
  return (
    <div className="flex h-[52px] items-center border-b border-dotted border-rule-2">
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
    </div>
  )
}

export default function Home({ onNavigate }: { onNavigate: (screen: NavTarget) => void }) {
  const [now] = useState(() => new Date())
  const [balance, setBalance] = useState<BalanceSummary>({ spendable: 0, reserved: 0 })
  const [totals, setTotals] = useState<MonthTotals>({ income: 0, expense: 0 })
  const [today, setToday] = useState<DayGroup | null>(null)

  const month = monthKey(now)
  const day = dayKey(now)

  useEffect(() => {
    let live = true
    void (async () => {
      const db = await getDb()
      const [summary, monthly, groups] = await Promise.all([
        balanceSummary(db),
        monthTotals(db, month),
        dayGroups(db, month),
      ])
      if (!live) return
      setBalance(summary)
      setTotals(monthly)
      setToday(groups.find((group) => group.date === day) ?? null)
    })()
    return () => {
      live = false
    }
  }, [month, day])

  const rows = today?.rows ?? []

  return (
    <div className="pt-5 pb-6">
      <div className="flex items-baseline text-[10px] tracking-[.2em] uppercase text-ink-3">
        <span>
          {now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </span>
        <span className={RULE_LEAD} />
        <span>
          {`${now.toLocaleDateString('en-US', { weekday: 'short' })} · Entry ${pad3(rows.length)}`}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onNavigate('accounts')}
        className="mt-[18px] block w-full text-left"
      >
        <span className="block text-[9.5px] tracking-[.2em] uppercase text-ink-3">Remaining</span>
        <span className="mt-0.5 block font-mono text-[38px] font-medium tracking-[-.02em] tabular-nums">
          <span className="mr-[.4em] align-[.12em] text-[.58em] text-ink-3">Rp</span>
          {plainText(balance.spendable + balance.reserved)}
        </span>
        <span className="mt-2 flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
          <span>Spendable</span>
          <span className={RULE_LEAD} />
          <span className="font-mono tabular-nums">{plainText(balance.spendable)}</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('insights')}
        className="-mx-5 mt-3 block bg-paper-2 px-5 pt-4 pb-3.5 text-left"
      >
        <span className="block text-[9.5px] tracking-[.2em] uppercase text-ink-3">
          {`This month · ${now.toLocaleDateString('en-US', { month: 'long' })}`}
        </span>
        <span className="mt-2.5 flex items-baseline text-[12.5px]">
          <span>Income</span>
          <span className={RULE_LEAD} />
          <span className={`${AMOUNT} font-semibold`}>{signedText(totals.income)}</span>
        </span>
        <span className="mt-2 flex items-baseline text-[12.5px]">
          <span>Expenses</span>
          <span className={RULE_LEAD} />
          <span className={AMOUNT}>{signedText(-totals.expense)}</span>
        </span>
      </button>
      <div className={TEAR} />

      <div className={`${PERF} mt-4`} />

      <div className="mt-3.5 flex h-[22px] items-baseline">
        <span className="text-[10px] tracking-[.2em] uppercase text-ink-2">Today</span>
        <span className="ml-auto text-[10px] tracking-[.1em] text-ink-3">
          {signedText(today?.subtotal ?? 0)}
        </span>
      </div>
      <div className="border-t border-ink opacity-75" />

      {rows.length === 0 ? (
        <div className="flex h-[52px] items-center text-[10px] tracking-[.18em] uppercase text-ink-3">
          No entries
        </div>
      ) : (
        rows.map((txn) => <Row key={txn.id} txn={txn} />)
      )}

      <button
        type="button"
        onClick={() => onNavigate('history')}
        className="mt-4 flex w-full items-baseline text-[10px] tracking-[.18em] uppercase text-ink-2"
      >
        <span>All activity</span>
        <span className={RULE_LEAD} />
        <span>→</span>
      </button>
    </div>
  )
}
