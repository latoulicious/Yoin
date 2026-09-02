import { useEffect, useState } from 'react'
import { getDb } from '../data/db'
import {
  dayGroups,
  deleteTransaction,
  deleteTransferGroup,
  listAccounts,
  monthTotals,
  updateTransaction,
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

function monthName(month: string): string {
  return dateOf(`${month}-01`).toLocaleDateString('en-US', { month: 'long' })
}

function dayLabel(day: string): string {
  const date = dateOf(day)
  return `${date.toLocaleDateString('en-US', { month: 'short' })} ${date.getDate()} · ${date.toLocaleDateString('en-US', { weekday: 'short' })}`
}

function signedText(value: number): string {
  if (value === 0) return '0'
  return `${value < 0 ? '−' : '+'}${Math.abs(value).toLocaleString('en-US')}`
}

function plainText(value: number): string {
  return value.toLocaleString('en-US')
}

function signedOf(txn: Transaction): number {
  return txn.kind === 'income' || txn.kind === 'transfer_in' ? txn.amount : -txn.amount
}

function rowLabel(txn: Transaction): string {
  if (txn.categoryName !== null) return txn.categoryName
  if (txn.kind === 'transfer_out' || txn.kind === 'transfer_in') return KIND_LABEL[txn.kind]
  if (txn.kind === 'income') return 'Income'
  return 'Uncategorized'
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
  onSave,
}: {
  txn: Transaction
  accountName: string
  onClose: () => void
  onDelete: () => void
  onSave: (amount: number, note: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [amountDraft, setAmountDraft] = useState(() => String(txn.amount))
  const [noteDraft, setNoteDraft] = useState(txn.note)
  const draftAmount = Number(amountDraft)
  const valid = amountDraft !== '' && draftAmount > 0
  const value = signedOf(txn)
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-ink/25 px-5" onClick={onClose}>
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
          <span className="font-sans text-[15px] font-medium">{rowLabel(txn)}</span>
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
        {!editing && txn.note !== '' && <Field label="Note" value={txn.note} />}

        {editing ? (
          <>
            <input
              inputMode="numeric"
              aria-label="Amount"
              value={amountDraft}
              onChange={(event) => setAmountDraft(event.target.value.replace(/\D/g, ''))}
              className="mt-3.5 h-9 w-full border-b border-rule bg-transparent font-mono text-[16px] tabular-nums outline-none"
            />
            <input
              aria-label="Note"
              placeholder="Note"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              className="mt-2 h-9 w-full border-b border-rule bg-transparent font-sans text-[14px] outline-none"
            />
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setAmountDraft(String(txn.amount))
                  setNoteDraft(txn.note)
                }}
                className="flex h-10 flex-1 items-center justify-center border border-dashed border-rule text-[10.5px] tracking-[.2em] uppercase text-ink-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!valid}
                onClick={() => onSave(draftAmount, noteDraft.trim())}
                className="flex h-10 flex-1 items-center justify-center border border-hanko text-[10.5px] font-semibold tracking-[.2em] uppercase text-hanko disabled:border-rule disabled:text-ink-3"
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <div className="mt-4 flex gap-2.5">
            {txn.transferGroupId === null && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex h-10 flex-1 items-center justify-center border border-dashed border-rule text-[10.5px] tracking-[.2em] uppercase text-ink-2"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              className="flex h-10 flex-1 items-center justify-center border border-hanko text-[10.5px] font-semibold tracking-[.2em] uppercase text-hanko"
            >
              {txn.transferGroupId === null ? 'Delete' : 'Delete transfer'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export interface HistoryFilter {
  categoryId: number | null
  name: string
  code: string | null
  month: string
}

export default function History({ initialFilter }: { initialFilter?: HistoryFilter | null }) {
  const [filter, setFilter] = useState(initialFilter ?? null)
  const [month, setMonth] = useState(() => initialFilter?.month ?? monthKey(new Date()))
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
        dayGroups(db, month, filter === null ? undefined : filter.categoryId),
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
  }, [month, version, filter])

  async function remove(txn: Transaction) {
    const db = await getDb()
    if (txn.transferGroupId !== null) await deleteTransferGroup(db, txn.transferGroupId)
    else await deleteTransaction(db, txn.id)
    setSelected(null)
    setVersion((current) => current + 1)
  }

  async function saveEdit(txn: Transaction, amount: number, note: string) {
    const db = await getDb()
    await updateTransaction(db, txn.id, { amount, note })
    setSelected(null)
    setVersion((current) => current + 1)
  }

  const net = totals.income - totals.expense
  const entries = groups.reduce((sum, group) => sum + group.rows.length, 0)
  const filteredTotal = groups.reduce((sum, group) => sum + group.subtotal, 0)
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

      {filter ? (
        <div className="pt-3.5 pb-4">
          <button
            type="button"
            onClick={() => setFilter(null)}
            aria-label={`Clear ${filter.name} filter`}
            className="inline-flex h-[30px] items-center gap-2 border border-hanko bg-hanko/10 pl-2.5 text-[10px] font-semibold tracking-[.14em] uppercase text-hanko"
          >
            <span className="inline-block border border-hanko px-1 py-px text-[9px] tracking-[.1em]">
              {filter.code ?? '··'}
            </span>
            {`${filter.name} · ${entries} ${entries === 1 ? 'entry' : 'entries'}`}
            <span className="flex h-5 w-5 items-center justify-center border-l border-dashed border-hanko/50 text-[12px] font-normal">
              ×
            </span>
          </button>
        </div>
      ) : (
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
      )}

      <div className={PERF} />

      {groups.length === 0 ? (
        <div className="flex h-[52px] items-center text-[10px] tracking-[.18em] uppercase text-ink-3">
          {filter ? `No ${filter.name} entries this month` : 'No entries this month'}
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
              if (txn.kind === 'transfer_in') return null
              const value = signedOf(txn)
              const time = txn.occurredAt.slice(11, 16)
              const transfer = txn.kind === 'transfer_out'
              const partner = transfer
                ? group.rows.find(
                    (r) => r.transferGroupId === txn.transferGroupId && r.kind === 'transfer_in',
                  )
                : undefined
              const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? '—'
              return (
                <button
                  key={txn.id}
                  type="button"
                  onClick={() => setSelected(txn)}
                  className="flex h-[52px] w-full items-center border-b border-dotted border-rule-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-[14.5px] font-medium">
                      {transfer
                        ? `${accountName(txn.accountId)} → ${partner ? accountName(partner.accountId) : '—'}`
                        : txn.note !== ''
                          ? txn.note
                          : rowLabel(txn)}
                    </span>
                    <span className="mt-[3px] block text-[10px] tracking-[.09em] uppercase text-ink-3">
                      <span className="mr-[7px] inline-block border border-rule px-1 py-px align-[1px] text-[9px] tracking-[.1em]">
                        {transfer ? '⇄' : (txn.categoryCode ?? '··')}
                      </span>
                      {transfer
                        ? `Transfer · ${time}`
                        : txn.note !== ''
                          ? `${rowLabel(txn)} · ${time}`
                          : time}
                    </span>
                  </span>
                  <span
                    className={`${AMOUNT} text-[14.5px] ${
                      transfer ? 'text-ink-2' : value < 0 ? '' : 'font-semibold'
                    }`}
                  >
                    {transfer ? plainText(txn.amount) : signedText(value)}
                  </span>
                </button>
              )
            })}
          </div>
        ))
      )}

      {filter && groups.length > 0 && (
        <>
          <div className="mt-3.5 h-[3px] border-y border-ink opacity-80" />
          <div className="mt-1.5 flex items-baseline pt-3.5">
            <span className="text-[10px] tracking-[.2em] uppercase text-hanko">
              {`${filter.name} · ${monthName(month)}`}
            </span>
            <span className={RULE_LEAD} />
            <span className={`${AMOUNT} text-[19px] font-semibold text-hanko`}>
              {signedText(filteredTotal)}
            </span>
          </div>
        </>
      )}

      {selected && (
        <Detail
          key={selected.id}
          txn={selected}
          accountName={accounts.find((a) => a.id === selected.accountId)?.name ?? '—'}
          onClose={() => setSelected(null)}
          onDelete={() => void remove(selected)}
          onSave={(amount, note) => void saveEdit(selected, amount, note)}
        />
      )}
    </div>
  )
}
