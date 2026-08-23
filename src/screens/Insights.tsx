import { useEffect, useState } from 'react'
import { getDb } from '../data/db'
import {
  categoryTotals,
  monthTotals,
  type CategoryTotal,
  type MonthTotals,
} from '../data/repo'

const RULE_LEAD = 'mx-2.5 min-w-3.5 flex-1 -translate-y-1 border-b border-dotted border-rule'

const PERF =
  '-mx-5 h-[9px] bg-repeat-x opacity-50 [background-image:radial-gradient(circle_at_5px_4.5px,var(--rule)_0_2.1px,transparent_2.4px)] [background-size:10px_9px]'

const AMOUNT = 'text-right font-mono tabular-nums whitespace-nowrap'

const SEAL =
  'flex h-[34px] w-[34px] shrink-0 rotate-[-3.5deg] items-center justify-center rounded-[3px] border-[1.4px] border-hanko font-serif text-[13px] leading-[1.05] text-hanko shadow-[0_0_0_2.5px_var(--paper),0_0_0_3.5px_color-mix(in_srgb,var(--red)_18%,transparent)] [writing-mode:vertical-rl]'

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

function monthName(month: string): string {
  return dateOf(`${month}-01`).toLocaleDateString('en-US', { month: 'long' })
}

function signedText(value: number): string {
  if (value === 0) return '0'
  return `${value < 0 ? '−' : '+'}${Math.abs(value).toLocaleString('en-US')}`
}

function rowName(row: CategoryTotal): string {
  return row.name ?? 'Uncategorized'
}

function patternNote(rows: CategoryTotal[]): string {
  const top = rows.reduce((best, row) => (row.count > best.count ? row : best), rows[0])
  const times = top.count === 1 ? 'once' : `${top.count} times`
  return `${rowName(top)} appears ${times} this month.`
}

export default function Insights() {
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const [totals, setTotals] = useState<MonthTotals>({ income: 0, expense: 0 })
  const [rows, setRows] = useState<CategoryTotal[]>([])

  useEffect(() => {
    let live = true
    void (async () => {
      const db = await getDb()
      const [monthly, categories] = await Promise.all([
        monthTotals(db, month),
        categoryTotals(db, month),
      ])
      if (!live) return
      setTotals(monthly)
      setRows(categories)
    })()
    return () => {
      live = false
    }
  }, [month])

  const net = totals.income - totals.expense
  const entries = rows.reduce((sum, row) => sum + row.count, 0)
  const max = rows[0]?.total ?? 0

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

      <div className="pt-4 pb-4">
        <div className="text-[9.5px] tracking-[.2em] uppercase text-ink-3">
          {`Remaining after ${monthName(month)}`}
        </div>
        <div
          className={`mt-0.5 font-mono text-[32px] tracking-[-.02em] tabular-nums ${net >= 0 ? 'font-semibold' : ''}`}
        >
          <span className="mr-[.4em] align-[.12em] text-[.58em] text-ink-3">Rp</span>
          {signedText(net)}
        </div>
      </div>

      <div className={PERF} />

      {rows.length === 0 ? (
        <div className="flex h-[52px] items-center text-[10px] tracking-[.18em] uppercase text-ink-3">
          No expenses this month
        </div>
      ) : (
        <>
          <div className="mt-2.5 flex items-baseline text-[9.5px] tracking-[.2em] uppercase text-ink-3">
            <span>Expenses by category</span>
            <span className={RULE_LEAD} />
            <span>{`${entries} entries`}</span>
          </div>
          <div className="mt-1.5 border-t border-ink opacity-75" />

          {rows.map((row) => (
            <div
              key={row.categoryId ?? 'none'}
              className="flex h-[46px] items-center border-b border-dotted border-rule-2"
            >
              <span className="w-[88px] font-sans text-[13.5px] font-medium">{rowName(row)}</span>
              <span className="w-[46px] text-[9.5px] tracking-[.1em] text-ink-3">{`${row.count}×`}</span>
              <span className="relative mr-3 h-[3px] flex-1 bg-ink/10">
                <span
                  className="absolute inset-y-0 left-0 block bg-ink opacity-45"
                  style={{ width: `${max === 0 ? 0 : Math.round((row.total / max) * 100)}%` }}
                />
              </span>
              <span className={`${AMOUNT} min-w-[96px] text-[13px]`}>
                {row.total.toLocaleString('en-US')}
              </span>
            </div>
          ))}

          <div className="mt-2.5 h-[3px] border-y border-ink opacity-80" />

          <div className="mt-1.5 flex items-baseline pt-3.5">
            <span className="text-[10px] tracking-[.2em] text-hanko">TOTAL EXPENSES</span>
            <span className={RULE_LEAD} />
            <span className={`${AMOUNT} text-[19px] font-semibold text-hanko`}>
              {signedText(-totals.expense)}
            </span>
          </div>

          <div className="mt-[22px] flex items-start gap-3.5 border border-dashed border-rule bg-paper-2 p-[18px]">
            <span className={SEAL}>余韻</span>
            <span>
              <span className="block text-[9.5px] tracking-[.2em] uppercase text-ink-3">
                Pattern
              </span>
              <span className="mt-2 block font-serif text-[13.5px] leading-[1.75] text-ink-2">
                {patternNote(rows)}
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  )
}
