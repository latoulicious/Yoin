import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { getDb, persist } from './db'
import {
  accountBalances,
  addTransaction,
  addTransferGroup,
  createAccount,
  dayGroups,
  deleteTransaction,
  deleteTransferGroup,
  listAccounts,
  listCategories,
  monthTotals,
  type DayGroup,
  type Transaction,
} from './repo'

declare global {
  interface Window {
    yoinCheck: () => Promise<void>
  }
}

// 1970 keeps the round-trip in a month the real ledger can never occupy.
const MONTH = '1970-01'
const ACCOUNT_NAME = 'devcheck'
const DEST_NAME = 'devcheck dest'

async function devcheck(): Promise<void> {
  const db = await getDb()
  await purge(db)

  const categories = await listCategories(db)
  assert(categories.length === 7, `expected 7 seeded categories, got ${categories.length}`)
  assert(
    categories.map((c) => c.code).join(',') === 'FD,TR,HM,LS,HL,OT,FE',
    `unexpected category order: ${categories.map((c) => c.code).join(',')}`,
  )
  const fee = categories[6]
  assert(fee.system, 'Fee category is not marked system')
  const food = categories[0]

  const accountId = await createAccount(db, {
    name: ACCOUNT_NAME,
    roleNote: 'temporary',
    reserved: false,
    openingBalance: 0,
  })
  const accounts = await listAccounts(db)
  const account = accounts.find((a) => a.id === accountId)
  assert(account !== undefined, `created account ${accountId} not returned by listAccounts`)
  assert(account.name === ACCOUNT_NAME && !account.reserved, 'created account round-tripped wrong')

  const incomeId = await addTransaction(db, {
    amount: 5000,
    kind: 'income',
    categoryId: null,
    accountId,
    note: 'devcheck income',
    occurredAt: `${MONTH}-01T09:00:00`,
  })
  const expenseId = await addTransaction(db, {
    amount: 1500,
    kind: 'expense',
    categoryId: food.id,
    accountId,
    note: 'devcheck expense',
    occurredAt: `${MONTH}-02T12:30:00`,
  })

  await assertBalance(db, accountId, 3500)
  await assertTotals(db, { income: 5000, expense: 1500 })

  const groups = await dayGroups(db, MONTH)
  assert(groups.length === 2, `expected 2 day groups, got ${groups.length}`)
  assert(groups[0].date === `${MONTH}-02`, `expected newest day first, got ${groups[0].date}`)
  assert(groups[0].subtotal === -1500, `expected day subtotal -1500, got ${groups[0].subtotal}`)
  assert(groups[1].subtotal === 5000, `expected day subtotal 5000, got ${groups[1].subtotal}`)
  assert(
    groups[0].rows[0].categoryCode === 'FD',
    `expected joined category code FD, got ${String(groups[0].rows[0].categoryCode)}`,
  )

  await deleteTransaction(db, expenseId)
  await assertBalance(db, accountId, 5000)
  await assertTotals(db, { income: 5000, expense: 0 })
  const afterDelete = await dayGroups(db, MONTH)
  assert(afterDelete.length === 1, `expected 1 day group after delete, got ${afterDelete.length}`)

  await deleteTransaction(db, incomeId)
  await assertTotals(db, { income: 0, expense: 0 })

  const destId = await createAccount(db, {
    name: DEST_NAME,
    roleNote: 'temporary',
    reserved: false,
    openingBalance: 0,
  })
  const groupId = await addTransferGroup(db, {
    fromId: accountId,
    toId: destId,
    amount: 2000,
    fee: 25,
    occurredAt: `${MONTH}-03T08:00:00`,
  })
  const legs = groupRows(await dayGroups(db, MONTH), groupId)
  assert(legs.length === 3, `expected 3 rows in transfer group, got ${legs.length}`)
  assert(
    legs.filter((r) => r.kind === 'fee').length === 1,
    'expected exactly one fee row in transfer group',
  )
  await assertBalance(db, accountId, -2025)
  await assertBalance(db, destId, 2000)
  await assertTotals(db, { income: 0, expense: 25 })

  await deleteTransferGroup(db, groupId)
  const afterGroupDelete = groupRows(await dayGroups(db, MONTH), groupId)
  assert(
    afterGroupDelete.length === 0,
    `expected 0 rows after deleteTransferGroup, got ${afterGroupDelete.length}`,
  )
  await assertTotals(db, { income: 0, expense: 0 })

  await purge(db)
  const remaining = await listAccounts(db)
  assert(
    remaining.every((a) => a.id !== accountId && a.id !== destId),
    `devcheck accounts ${accountId}/${destId} survived cleanup`,
  )

  console.log('yoin devcheck OK')
}

async function assertBalance(db: SQLiteDBConnection, accountId: number, expected: number): Promise<void> {
  const balances = await accountBalances(db)
  const found = balances.find((b) => b.accountId === accountId)
  assert(found !== undefined, `no balance row for account ${accountId}`)
  assert(found.balance === expected, `expected balance ${expected}, got ${found.balance}`)
}

async function assertTotals(db: SQLiteDBConnection, expected: { income: number; expense: number }): Promise<void> {
  const totals = await monthTotals(db, MONTH)
  assert(
    totals.income === expected.income && totals.expense === expected.expense,
    `expected totals ${JSON.stringify(expected)}, got ${JSON.stringify(totals)}`,
  )
}

function groupRows(groups: DayGroup[], groupId: string): Transaction[] {
  return groups.flatMap((g) => g.rows).filter((r) => r.transferGroupId === groupId)
}

async function purge(db: SQLiteDBConnection): Promise<void> {
  await db.run('DELETE FROM transactions WHERE substr(occurred_at, 1, 7) = ?', [MONTH])
  await db.run('DELETE FROM accounts WHERE name IN (?, ?)', [ACCOUNT_NAME, DEST_NAME])
  await persist()
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`yoin devcheck: ${message}`)
}

window.yoinCheck = devcheck
