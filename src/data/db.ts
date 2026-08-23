import { Capacitor } from '@capacitor/core'
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import { upgrades } from './schema'

const DB_NAME = 'yoin'
const isWeb = Capacitor.getPlatform() === 'web'

const sqlite = new SQLiteConnection(CapacitorSQLite)

let dbPromise: Promise<SQLiteDBConnection> | undefined

export function getDb(): Promise<SQLiteDBConnection> {
  dbPromise ??= connect().catch((err: unknown) => {
    dbPromise = undefined
    throw err
  })
  return dbPromise
}

// web keeps the database in memory; without this every write is lost on reload.
export async function persist(): Promise<void> {
  if (isWeb) await sqlite.saveToStore(DB_NAME)
}

async function connect(): Promise<SQLiteDBConnection> {
  if (isWeb) await initWeb()

  await sqlite.addUpgradeStatement(DB_NAME, upgrades)

  // the plugin's connection registry is native-side and outlives this module, so a
  // stale connection survives HMR and must be retrieved rather than re-created.
  const existing = await sqlite.isConnection(DB_NAME, false)
  const db = existing.result
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 2, false)

  const open = await db.isDBOpen()
  if (!open.result) await db.open()

  return db
}

async function initWeb(): Promise<void> {
  // the custom element registry also survives HMR — re-defining it throws.
  if (!customElements.get('jeep-sqlite')) {
    const { defineCustomElements } = await import('jeep-sqlite/loader')
    defineCustomElements(window)
    document.body.appendChild(document.createElement('jeep-sqlite'))
    await customElements.whenDefined('jeep-sqlite')
  }
  await sqlite.initWebStore()
}
