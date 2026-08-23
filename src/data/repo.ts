import type { Changes, SQLiteDBConnection } from '@capacitor-community/sqlite'
import { persist } from './db'

export type TxnKind = 'expense' | 'income' | 'transfer_out' | 'transfer_in' | 'fee'

export interface Account {
  id: number
  name: string
  roleNote: string
  reserved: boolean
}

export interface AccountInput {
  name: string
  roleNote: string
  reserved: boolean
}

export interface Category {
  id: number
  name: string
  code: string
  system: boolean
  archived: boolean
  sort: number
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

interface AccountRow {
  id: number
  name: string
  role_note: string
  reserved: number
}

interface CategoryRow {
  id: number
  name: string
  code: string
  system: number
  archived: number
  sort: number
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

export async function listAccounts(db: SQLiteDBConnection): Promise<Account[]> {
  const rows = await query<AccountRow>(db, 'SELECT id, name, role_note, reserved FROM accounts ORDER BY id')
  return rows.map((r) => ({ id: r.id, name: r.name, roleNote: r.role_note, reserved: r.reserved !== 0 }))
}

export async function createAccount(db: SQLiteDBConnection, input: AccountInput): Promise<number> {
  const changes = await write(db, 'INSERT INTO accounts (name, role_note, reserved) VALUES (?, ?, ?)', [
    input.name,
    input.roleNote,
    input.reserved ? 1 : 0,
  ])
  return lastId(changes, 'createAccount')
}

export async function updateAccount(db: SQLiteDBConnection, id: number, input: AccountInput): Promise<void> {
  await write(db, 'UPDATE accounts SET name = ?, role_note = ?, reserved = ? WHERE id = ?', [
    input.name,
    input.roleNote,
    input.reserved ? 1 : 0,
    id,
  ])
}

export async function listCategories(db: SQLiteDBConnection): Promise<Category[]> {
  const rows = await query<CategoryRow>(
    db,
    'SELECT id, name, code, system, archived, sort FROM categories ORDER BY sort',
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    system: r.system !== 0,
    archived: r.archived !== 0,
    sort: r.sort,
  }))
}

export async function addTransaction(db: SQLiteDBConnection, input: TransactionInput): Promise<number> {
  const changes = await write(
    db,
    `INSERT INTO transactions (amount, kind, category_id, account_id, note, occurred_at, transfer_group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.amount,
      input.kind,
      input.categoryId,
      input.accountId,
      input.note,
      input.occurredAt,
      input.transferGroupId ?? null,
    ],
  )
  return lastId(changes, 'addTransaction')
}

export async function deleteTransaction(db: SQLiteDBConnection, id: number): Promise<void> {
  await write(db, 'DELETE FROM transactions WHERE id = ?', [id])
}

export async function accountBalances(db: SQLiteDBConnection): Promise<AccountBalance[]> {
  return query<AccountBalance>(
    db,
    `SELECT account_id AS accountId, SUM(${SIGNED_AMOUNT}) AS balance
     FROM transactions GROUP BY account_id`,
  )
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
