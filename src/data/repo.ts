import type { capSQLiteSet, Changes, SQLiteDBConnection } from '@capacitor-community/sqlite'
import { persist } from './db'

export type TxnKind = 'expense' | 'income' | 'transfer_out' | 'transfer_in' | 'fee'

export interface Account {
  id: number
  name: string
  roleNote: string
  reserved: boolean
  openingBalance: number
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
  count: number
  total: number
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
}

interface CategoryRow {
  id: number
  name: string
  code: string
  system: number
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

const SIGNED_AMOUNT = `CASE WHEN kind IN ('income','transfer_in') THEN amount ELSE -amount END`

// left-joined from accounts so an account with no transactions still contributes its opening balance.
const ACCOUNT_NET = `(SELECT account_id, SUM(${SIGNED_AMOUNT}) AS net FROM transactions GROUP BY account_id)`

const INSERT_TXN = `INSERT INTO transactions (amount, kind, category_id, account_id, note, occurred_at, transfer_group_id)
   VALUES (?, ?, ?, ?, ?, ?, ?)`

export async function listAccounts(db: SQLiteDBConnection): Promise<Account[]> {
  const rows = await query<AccountRow>(
    db,
    'SELECT id, name, role_note, reserved, opening_balance FROM accounts ORDER BY id',
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    roleNote: r.role_note,
    reserved: r.reserved !== 0,
    openingBalance: r.opening_balance,
  }))
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
    'SELECT id, name, code, system, archived, sort, kind FROM categories ORDER BY system, sort',
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    system: r.system !== 0,
    archived: r.archived !== 0,
    sort: r.sort,
    kind: r.kind,
  }))
}

function codeFrom(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export async function createCategory(db: SQLiteDBConnection, name: string): Promise<number> {
  const changes = await write(
    db,
    `INSERT INTO categories (name, code, system, archived, sort)
     VALUES (?, ?, 0, 0, (SELECT COALESCE(MAX(sort), 0) + 1 FROM categories))`,
    [name, codeFrom(name)],
  )
  return lastId(changes, 'createCategory')
}

export async function renameCategory(db: SQLiteDBConnection, id: number, name: string): Promise<void> {
  await write(db, 'UPDATE categories SET name = ?, code = ? WHERE id = ? AND system = 0', [
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
  await write(db, 'UPDATE categories SET archived = ? WHERE id = ? AND system = 0', [
    archived ? 1 : 0,
    id,
  ])
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

export async function dayGroups(db: SQLiteDBConnection, month: string): Promise<DayGroup[]> {
  const rows = await query<TransactionRow>(
    db,
    `SELECT t.id, t.amount, t.kind, t.category_id, t.account_id, t.note, t.occurred_at, t.transfer_group_id,
            c.name AS category_name, c.code AS category_code
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE substr(t.occurred_at, 1, 7) = ?
     ORDER BY t.occurred_at DESC, t.id DESC`,
    [month],
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
    `SELECT t.category_id AS categoryId, c.name AS name, COUNT(*) AS count, SUM(t.amount) AS total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.kind IN ('expense','fee') AND substr(t.occurred_at, 1, 7) = ?
     GROUP BY t.category_id
     ORDER BY total DESC`,
    [month],
  )
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
