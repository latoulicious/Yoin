import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'

const DB_NAME = 'yoin'

const sqlite = new SQLiteConnection(CapacitorSQLite)

let dbPromise: Promise<SQLiteDBConnection> | undefined

export function getDb(): Promise<SQLiteDBConnection> {
  dbPromise ??= connect().catch((err: unknown) => {
    dbPromise = undefined
    throw err
  })
  return dbPromise
}

async function connect(): Promise<SQLiteDBConnection> {
  // the plugin's connection registry is native-side and outlives this module, so a
  // stale connection survives HMR and must be retrieved rather than re-created.
  const existing = await sqlite.isConnection(DB_NAME, false)
  const db = existing.result
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)

  const open = await db.isDBOpen()
  if (!open.result) await db.open()

  return db
}
