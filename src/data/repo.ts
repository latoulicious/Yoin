import type { capSQLiteSet, Changes, SQLiteDBConnection } from '@capacitor-community/sqlite'
import { persist } from './db'

export type TxnKind = 'expense' | 'income' | 'transfer_out' | 'transfer_in' | 'fee'

export interface Account {
  id: number
  name: string
  roleNote: string
  reserved: boolean
  openingBalance: number
  archived: boolean
}

export interface AccountInput {
  name: string
  roleNote: string
  reserved: boolean
  openingBalance: number
}

export interface Category {
  id: number
  name: string
  code: string
  system: boolean
  locked: boolean
  archived: boolean
  sort: number
  kind: 'expense' | 'income'
}

export interface TransactionInput {
  amount: number
  kind: TxnKind
  categoryId: number | null
  accountId: number
  note: string
  occurredAt: string
  transferGroupId?: string | null
}

export interface TransferInput {
  fromId: number
  toId: number
  amount: number
  fee: number
  occurredAt: string
}

export interface Transaction {
  id: number
  amount: number
  kind: TxnKind
  categoryId: number | null
  accountId: number
  note: string
  occurredAt: string
  transferGroupId: string | null
  categoryName: string | null
  categoryCode: string | null
}

export interface AccountBalance {
  accountId: number
  balance: number
}

export interface DayGroup {
  date: string
  subtotal: number
  rows: Transaction[]
}

export interface MonthTotals {
  income: number
  expense: number
}

export interface BalanceSummary {
  spendable: number
  reserved: number
}

export interface CategoryTotal {
  categoryId: number | null
  name: string | null
  code: string | null
  count: number
  total: number
}

export interface RecurringInput {
  note: string
  amount: number
  categoryId: number
  accountId: number
  day: number
}

export interface RecurringRule extends RecurringInput {
  id: number
  lastMonth: string
  categoryName: string
  categorySystem: boolean
  accountName: string
  accountArchived: boolean
}

// field names double as CSV column headers — see toCsv in ./csv.
export interface ExportRow {
  id: number
  occurred_at: string
  kind: TxnKind
  amount: number
  category: string | null
  account: string
  note: string
  transfer_group_id: string | null
}

interface AccountRow {
  id: number
  name: string
  role_note: string
  reserved: number
  opening_balance: number
  archived: number
}

interface CategoryRow {
  id: number
  name: string
  code: string
  system: number
  locked: number
  archived: number
  sort: number
  kind: 'expense' | 'income'
}

interface TransactionRow {
  id: number
  amount: number
  kind: TxnKind
  category_id: number | null
  account_id: number
  note: string
  occurred_at: string
  transfer_group_id: string | null
  category_name: string | null
  category_code: string | null
}

interface RecurringRuleRow {
  id: number
  note: string
  amount: number
  category_id: number
  account_id: number
  day: number
  last_month: string
  category_name: string
  category_system: number
  account_name: string
  account_archived: number
}

const SIGNED_AMOUNT = `CASE WHEN kind IN ('income','transfer_in') THEN amount ELSE -amount END`

// left-joined from accounts so an account with no transactions still contributes its opening balance.
const ACCOUNT_NET = `(SELECT account_id, SUM(${SIGNED_AMOUNT}) AS net FROM transactions GROUP BY account_id)`

const INSERT_TXN = `INSERT INTO transactions (amount, kind, category_id, account_id, note, occurred_at, transfer_group_id)
   VALUES (?, ?, ?, ?, ?, ?, ?)`

export async function listAccounts(db: SQLiteDBConnection): Promise<Account[]> {
  const rows = await query<AccountRow>(
    db,
    'SELECT id, name, role_note, reserved, opening_balance, archived FROM accounts ORDER BY archived, id',
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    roleNote: r.role_note,
    reserved: r.reserved !== 0,
    openingBalance: r.opening_balance,
    archived: r.archived !== 0,
  }))
}

export async function setAccountArchived(
  db: SQLiteDBConnection,
  id: number,
  archived: boolean,
): Promise<void> {
  await write(db, 'UPDATE accounts SET archived = ? WHERE id = ?', [archived ? 1 : 0, id])
}

export async function createAccount(db: SQLiteDBConnection, input: AccountInput): Promise<number> {
  const changes = await write(
    db,
    'INSERT INTO accounts (name, role_note, reserved, opening_balance) VALUES (?, ?, ?, ?)',
    [input.name, input.roleNote, input.reserved ? 1 : 0, Math.trunc(input.openingBalance)],
  )
  return lastId(changes, 'createAccount')
}

export async function updateAccount(db: SQLiteDBConnection, id: number, input: AccountInput): Promise<void> {
  await write(
    db,
    'UPDATE accounts SET name = ?, role_note = ?, reserved = ?, opening_balance = ? WHERE id = ?',
    [input.name, input.roleNote, input.reserved ? 1 : 0, Math.trunc(input.openingBalance), id],
  )
}

export async function listCategories(db: SQLiteDBConnection): Promise<Category[]> {
  const rows = await query<CategoryRow>(
    db,
    'SELECT id, name, code, system, locked, archived, sort, kind FROM categories ORDER BY locked, system, sort',
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    system: r.system !== 0,
    locked: r.locked !== 0,
    archived: r.archived !== 0,
    sort: r.sort,
    kind: r.kind,
  }))
}

function codeFrom(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export async function createCategory(
  db: SQLiteDBConnection,
  name: string,
  kind: Category['kind'],
): Promise<number> {
  const changes = await write(
    db,
    `INSERT INTO categories (name, code, system, archived, sort, kind)
     VALUES (?, ?, 0, 0, (SELECT COALESCE(MAX(sort), 0) + 1 FROM categories), ?)`,
    [name, codeFrom(name), kind],
  )
  return lastId(changes, 'createCategory')
}

export async function renameCategory(db: SQLiteDBConnection, id: number, name: string): Promise<void> {
  await write(db, 'UPDATE categories SET name = ?, code = ? WHERE id = ? AND locked = 0', [
    name,
    codeFrom(name),
    id,
  ])
}

export async function setCategoryArchived(
  db: SQLiteDBConnection,
  id: number,
  archived: boolean,
): Promise<void> {
  await write(db, 'UPDATE categories SET archived = ? WHERE id = ? AND locked = 0', [
    archived ? 1 : 0,
    id,
  ])
}

export async function reorderCategories(db: SQLiteDBConnection, ids: number[]): Promise<void> {
  const set: capSQLiteSet[] = ids.map((id, index) => ({
    statement: 'UPDATE categories SET sort = ? WHERE id = ? AND locked = 0',
    values: [index + 1, id],
  }))
  await db.executeSet(set)
  await persist()
}

export async function addTransaction(db: SQLiteDBConnection, input: TransactionInput): Promise<number> {
  const changes = await write(db, INSERT_TXN, [
    input.amount,
    input.kind,
    input.categoryId,
    input.accountId,
    input.note,
    input.occurredAt,
    input.transferGroupId ?? null,
  ])
  return lastId(changes, 'addTransaction')
}

export async function updateTransaction(
  db: SQLiteDBConnection,
  id: number,
  input: { amount: number; note: string },
): Promise<void> {
  await write(db, 'UPDATE transactions SET amount = ?, note = ? WHERE id = ?', [
    input.amount,
    input.note,
    id,
  ])
}

export async function deleteTransaction(db: SQLiteDBConnection, id: number): Promise<void> {
  await write(db, 'DELETE FROM transactions WHERE id = ?', [id])
}

export async function addTransferGroup(db: SQLiteDBConnection, input: TransferInput): Promise<string> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('addTransferGroup: amount must be positive')
  }
  if (!Number.isFinite(input.fee) || input.fee < 0) {
    throw new Error('addTransferGroup: fee must not be negative')
  }
  const feeRows = await query<{ id: number }>(
    db,
    `SELECT id FROM categories WHERE code = 'FE' AND system = 1`,
  )
  const feeCategoryId = feeRows[0]?.id
  if (feeCategoryId === undefined) throw new Error('addTransferGroup: Fee category missing')

  const groupId = crypto.randomUUID()
  const set: capSQLiteSet[] = [
    {
      statement: INSERT_TXN,
      values: [input.amount, 'transfer_out', null, input.fromId, '', input.occurredAt, groupId],
    },
    {
      statement: INSERT_TXN,
      values: [input.amount, 'transfer_in', null, input.toId, '', input.occurredAt, groupId],
    },
  ]
  if (input.fee > 0) {
    set.push({
      statement: INSERT_TXN,
      values: [input.fee, 'fee', feeCategoryId, input.fromId, '', input.occurredAt, groupId],
    })
  }

  // executeSet wraps the set in one transaction, so a half-written transfer can't land.
  await db.executeSet(set)
  await persist()
  return groupId
}

export async function deleteTransferGroup(db: SQLiteDBConnection, groupId: string): Promise<void> {
  await write(db, 'DELETE FROM transactions WHERE transfer_group_id = ?', [groupId])
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function monthKey(year: number, monthIndex: number): string {
  const date = new Date(year, monthIndex, 1)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function followingMonth(month: string): string {
  return monthKey(Number(month.slice(0, 4)), Number(month.slice(5, 7)))
}

function occurrence(month: string, day: number): string {
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  return `${month}-${pad(Math.min(day, lastDay))}`
}

function localDate(date: Date): string {
  return `${monthKey(date.getFullYear(), date.getMonth())}-${pad(date.getDate())}`
}

export function nextOccurrence(lastMonth: string, day: number): string {
  return occurrence(followingMonth(lastMonth), day)
}

export function dueDates(lastMonth: string, day: number, now: Date): string[] {
  const today = localDate(now)
  const dates: string[] = []
  let date = nextOccurrence(lastMonth, day)
  while (date <= today) {
    dates.push(date)
    date = nextOccurrence(date.slice(0, 7), day)
  }
  return dates
}

// Starts a rule on its next future date: a fee already charged this month was likely recorded by hand.
export function startingCursor(day: number, now: Date): string {
  const month = monthKey(now.getFullYear(), now.getMonth())
  return occurrence(month, day) <= localDate(now)
    ? month
    : monthKey(now.getFullYear(), now.getMonth() - 1)
}

export async function listRecurring(db: SQLiteDBConnection): Promise<RecurringRule[]> {
  const rows = await query<RecurringRuleRow>(
    db,
    `SELECT r.id, r.note, r.amount, r.category_id, r.account_id, r.day, r.last_month,
            c.name AS category_name, c.system AS category_system,
            a.name AS account_name, a.archived AS account_archived
     FROM recurring_rules r
     JOIN categories c ON c.id = r.category_id
     JOIN accounts a ON a.id = r.account_id
     ORDER BY r.day, r.id`,
  )
  return rows.map((r) => ({
    id: r.id,
    note: r.note,
    amount: r.amount,
    categoryId: r.category_id,
    accountId: r.account_id,
    day: r.day,
    lastMonth: r.last_month,
    categoryName: r.category_name,
    categorySystem: r.category_system !== 0,
    accountName: r.account_name,
    accountArchived: r.account_archived !== 0,
  }))
}

export async function createRecurring(
  db: SQLiteDBConnection,
  input: RecurringInput,
  now = new Date(),
): Promise<number> {
  const changes = await write(
    db,
    `INSERT INTO recurring_rules (note, amount, category_id, account_id, day, last_month)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.note, input.amount, input.categoryId, input.accountId, input.day, startingCursor(input.day, now)],
  )
  return lastId(changes, 'createRecurring')
}

// MAX keeps an edit from backfilling months the rule never covered, and from re-posting ones it did.
export async function updateRecurring(
  db: SQLiteDBConnection,
  id: number,
  input: RecurringInput,
  now = new Date(),
): Promise<void> {
  await write(
    db,
    `UPDATE recurring_rules
     SET note = ?, amount = ?, category_id = ?, account_id = ?, day = ?, last_month = MAX(last_month, ?)
     WHERE id = ?`,
    [input.note, input.amount, input.categoryId, input.accountId, input.day, startingCursor(input.day, now), id],
  )
}

export async function deleteRecurring(db: SQLiteDBConnection, id: number): Promise<void> {
  await write(db, 'DELETE FROM recurring_rules WHERE id = ?', [id])
}

// The cursor lives on the rule, not in a lookup of posted rows, so deleting a posted entry never
// brings it back. Each statement re-checks it, so overlapping runs cannot post a month twice.
export async function postDueRecurring(db: SQLiteDBConnection, now = new Date()): Promise<number> {
  let posted = 0
  for (const rule of await listRecurring(db)) {
    const dates = dueDates(rule.lastMonth, rule.day, now)
    if (dates.length === 0) continue
    const kind: TxnKind = rule.categorySystem ? 'fee' : 'expense'
    const inserts: capSQLiteSet[] = rule.accountArchived
      ? []
      : dates.map((date) => ({
          statement: `INSERT INTO transactions (amount, kind, category_id, account_id, note, occurred_at)
             SELECT amount, ?, category_id, account_id, note, ? FROM recurring_rules
             WHERE id = ? AND last_month = ?`,
          values: [kind, `${date}T00:00:00`, rule.id, rule.lastMonth],
        }))
    await db.executeSet([
      ...inserts,
      {
        statement: 'UPDATE recurring_rules SET last_month = ? WHERE id = ? AND last_month = ?',
        values: [dates[dates.length - 1].slice(0, 7), rule.id, rule.lastMonth],
      },
    ])
    await persist()
    posted += inserts.length
  }
  return posted
}

export async function accountBalances(db: SQLiteDBConnection): Promise<AccountBalance[]> {
  return query<AccountBalance>(
    db,
    `SELECT a.id AS accountId, a.opening_balance + COALESCE(tx.net, 0) AS balance
     FROM accounts a LEFT JOIN ${ACCOUNT_NET} tx ON tx.account_id = a.id`,
  )
}

export async function balanceSummary(db: SQLiteDBConnection): Promise<BalanceSummary> {
  const rows = await query<BalanceSummary>(
    db,
    `SELECT COALESCE(SUM(CASE WHEN a.reserved = 0 THEN a.opening_balance + COALESCE(tx.net, 0) ELSE 0 END), 0) AS spendable,
            COALESCE(SUM(CASE WHEN a.reserved = 1 THEN a.opening_balance + COALESCE(tx.net, 0) ELSE 0 END), 0) AS reserved
     FROM accounts a LEFT JOIN ${ACCOUNT_NET} tx ON tx.account_id = a.id`,
  )
  return rows[0] ?? { spendable: 0, reserved: 0 }
}

export async function dayGroups(
  db: SQLiteDBConnection,
  month: string,
  categoryId?: number | null,
): Promise<DayGroup[]> {
  // null categoryId means the Uncategorized expense bucket, so the kind guard is
  // required to keep legacy income and transfer legs (also null-category) out.
  const categoryClause =
    categoryId === undefined
      ? ''
      : categoryId === null
        ? ` AND t.kind IN ('expense','fee') AND t.category_id IS NULL`
        : ` AND t.kind IN ('expense','fee') AND t.category_id = ?`
  const rows = await query<TransactionRow>(
    db,
    `SELECT t.id, t.amount, t.kind, t.category_id, t.account_id, t.note, t.occurred_at, t.transfer_group_id,
            c.name AS category_name, c.code AS category_code
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE substr(t.occurred_at, 1, 7) = ?${categoryClause}
     ORDER BY t.occurred_at DESC, t.id DESC`,
    typeof categoryId === 'number' ? [month, categoryId] : [month],
  )

  const groups = new Map<string, DayGroup>()
  for (const row of rows) {
    const date = row.occurred_at.slice(0, 10)
    let group = groups.get(date)
    if (!group) {
      group = { date, subtotal: 0, rows: [] }
      groups.set(date, group)
    }
    group.subtotal += row.kind === 'income' || row.kind === 'transfer_in' ? row.amount : -row.amount
    group.rows.push(toTransaction(row))
  }
  return [...groups.values()]
}

export async function monthTotals(db: SQLiteDBConnection, month: string): Promise<MonthTotals> {
  const rows = await query<MonthTotals>(
    db,
    `SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN kind IN ('expense','fee') THEN amount ELSE 0 END), 0) AS expense
     FROM transactions WHERE substr(occurred_at, 1, 7) = ?`,
    [month],
  )
  return rows[0] ?? { income: 0, expense: 0 }
}

export async function categoryTotals(db: SQLiteDBConnection, month: string): Promise<CategoryTotal[]> {
  return query<CategoryTotal>(
    db,
    `SELECT t.category_id AS categoryId, c.name AS name, c.code AS code, COUNT(*) AS count, SUM(t.amount) AS total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.kind IN ('expense','fee') AND substr(t.occurred_at, 1, 7) = ?
     GROUP BY t.category_id
     ORDER BY total DESC`,
    [month],
  )
}

export async function countTransactions(db: SQLiteDBConnection): Promise<number> {
  const rows = await query<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM transactions')
  return rows[0]?.n ?? 0
}

export async function exportRows(db: SQLiteDBConnection): Promise<ExportRow[]> {
  return query<ExportRow>(
    db,
    `SELECT t.id, t.occurred_at, t.kind, t.amount, c.name AS category, a.name AS account,
            t.note, t.transfer_group_id
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     JOIN accounts a ON a.id = t.account_id
     ORDER BY t.occurred_at, t.id`,
  )
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    amount: row.amount,
    kind: row.kind,
    categoryId: row.category_id,
    accountId: row.account_id,
    note: row.note,
    occurredAt: row.occurred_at,
    transferGroupId: row.transfer_group_id,
    categoryName: row.category_name,
    categoryCode: row.category_code,
  }
}

async function query<T>(db: SQLiteDBConnection, statement: string, values?: unknown[]): Promise<T[]> {
  const res = await db.query(statement, values)
  return (res.values ?? []) as T[]
}

async function write(db: SQLiteDBConnection, statement: string, values: unknown[]): Promise<Changes> {
  const res = await db.run(statement, values)
  await persist()
  return res.changes ?? {}
}

function lastId(changes: Changes, op: string): number {
  if (changes.lastId === undefined || changes.lastId < 0) throw new Error(`${op}: no row id returned`)
  return changes.lastId
}
