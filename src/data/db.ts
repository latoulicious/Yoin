import { Capacitor } from '@capacitor/core'
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { FilePicker } from '@capawesome/capacitor-file-picker'
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

// native downloads are inert in the WebView, so files leave via the share sheet.
export async function shareFile(path: string, data: string): Promise<void> {
  const file = await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })
  await Share.share({ files: [file.uri] })
}

export async function backupToDisk(): Promise<void> {
  if (isWeb) {
    await sqlite.saveToLocalDisk(DB_NAME)
    return
  }
  const db = await getDb()
  const json = await db.exportToJson('full')
  await shareFile('yoin-backup.json', JSON.stringify(json.export))
}

export async function restoreFromDisk(): Promise<void> {
  if (isWeb) {
    await sqlite.getFromLocalDiskToStore(true)
    // the open connection still holds the pre-swap in-memory db; reload is the only reset.
    location.reload()
    return
  }
  const picked = await FilePicker.pickFiles({ limit: 1, readData: true })
  const encoded = picked.files[0]?.data
  if (encoded === undefined) return
  // atob yields a byte string; decode as UTF-8 so non-ASCII notes survive.
  const jsonstring = new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)))
  const parsed = JSON.parse(jsonstring) as { database?: string }
  if (parsed.database !== DB_NAME) throw new Error('not a yoin backup')
  const existing = await sqlite.isConnection(DB_NAME, false)
  if (existing.result) await sqlite.closeConnection(DB_NAME, false)
  dbPromise = undefined
  await sqlite.importFromJson(jsonstring)
  location.reload()
}

async function connect(): Promise<SQLiteDBConnection> {
  if (isWeb) await initWeb()

  await sqlite.addUpgradeStatement(DB_NAME, upgrades)

  // the plugin's connection registry is native-side and outlives this module, so a
  // stale connection survives HMR and must be retrieved rather than re-created.
  const existing = await sqlite.isConnection(DB_NAME, false)
  const db = existing.result
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 4, false)

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
