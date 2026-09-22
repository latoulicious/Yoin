import { App } from '@capacitor/app'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { useSyncExternalStore } from 'react'

const MANIFEST_URL = 'https://github.com/latoulicious/Yoin/releases/download/latest/manifest.json'

export type Manifest = {
  bundle: { version: string; commit: string; url: string; sha256: string; minNative: number }
  apk: { versionCode: number; versionName: string; url: string; bytes: number }
  changelog: string[]
  date: string
}

export type Shell = { version: string; build: number }

export type UpdateState =
  | { kind: 'idle'; checkedAt: number | null }
  | { kind: 'checking'; checkedAt: number | null }
  | { kind: 'offline'; checkedAt: number | null }
  | { kind: 'downloading'; percent: number; manifest: Manifest }
  | { kind: 'failed'; manifest: Manifest }
  | { kind: 'ready'; manifest: Manifest; bundleId: string }
  | { kind: 'apk'; manifest: Manifest }

export type Sheet = 'apk' | 'ready' | 'uptodate' | null

type Snapshot = { shell: Shell | null; update: UpdateState; sheet: Sheet }

const isNative = Capacitor.isNativePlatform()

let snapshot: Snapshot = { shell: null, update: { kind: 'idle', checkedAt: null }, sheet: null }
const listeners = new Set<() => void>()
let snoozedApk = 0

function emit(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

export function useUpdate(): Snapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshot,
  )
}

async function loadShell(): Promise<Shell> {
  if (snapshot.shell) return snapshot.shell
  const shell = isNative
    ? await App.getInfo().then((info) => ({ version: info.version, build: Number(info.build) }))
    : { version: 'web', build: 0 }
  emit({ shell })
  return shell
}

async function fetchManifest(): Promise<Manifest | null> {
  try {
    const res = await CapacitorHttp.get({
      url: MANIFEST_URL,
      connectTimeout: 5000,
      readTimeout: 5000,
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (res.status !== 200) return null
    return (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as Manifest
  } catch {
    return null
  }
}

async function findDownloaded(commit: string): Promise<string | null> {
  const { bundles } = await CapacitorUpdater.list()
  return bundles.find((b) => b.version === commit && b.status !== 'error')?.id ?? null
}

async function download(manifest: Manifest) {
  emit({ update: { kind: 'downloading', percent: 0, manifest } })
  const handle = await CapacitorUpdater.addListener('download', ({ percent }) => {
    if (snapshot.update.kind === 'downloading')
      emit({ update: { ...snapshot.update, percent } })
  })
  try {
    const bundle = await CapacitorUpdater.download({
      url: manifest.bundle.url,
      version: manifest.bundle.commit,
      checksum: manifest.bundle.sha256,
    })
    await CapacitorUpdater.next({ id: bundle.id })
    emit({ update: { kind: 'ready', manifest, bundleId: bundle.id } })
  } catch {
    emit({ update: { kind: 'failed', manifest } })
  } finally {
    await handle.remove()
  }
}

export async function check(source: 'boot' | 'manual') {
  const { update } = snapshot
  if (update.kind === 'checking' || update.kind === 'downloading') return
  const checkedAt = 'checkedAt' in update ? update.checkedAt : Date.now()
  emit({ update: { kind: 'checking', checkedAt }, sheet: null })

  const manifest = await fetchManifest()
  if (!manifest) {
    emit({ update: { kind: 'offline', checkedAt } })
    return
  }
  const shell = await loadShell()
  const now = Date.now()

  if (isNative && manifest.apk.versionCode > shell.build) {
    emit({
      update: { kind: 'apk', manifest },
      sheet: source === 'manual' || snoozedApk < manifest.apk.versionCode ? 'apk' : null,
    })
    return
  }

  if (isNative && manifest.bundle.commit !== __COMMIT__) {
    const existing = await findDownloaded(manifest.bundle.commit)
    if (existing) {
      await CapacitorUpdater.next({ id: existing })
      emit({ update: { kind: 'ready', manifest, bundleId: existing } })
    } else {
      await download(manifest)
    }
    if (source === 'manual' && snapshot.update.kind === 'ready') emit({ sheet: 'ready' })
    return
  }

  emit({ update: { kind: 'idle', checkedAt: now }, sheet: source === 'manual' ? 'uptodate' : null })
}

export function retry() {
  if (snapshot.update.kind === 'failed') void download(snapshot.update.manifest)
}

export function applyNow() {
  if (snapshot.update.kind === 'ready') void CapacitorUpdater.set({ id: snapshot.update.bundleId })
}

export function openApk() {
  if ('manifest' in snapshot.update) window.open(snapshot.update.manifest.apk.url, '_system')
}

export function dismissSheet() {
  if (snapshot.update.kind === 'apk') snoozedApk = snapshot.update.manifest.apk.versionCode
  emit({ sheet: null })
}

export function boot() {
  void CapacitorUpdater.notifyAppReady()
  void loadShell()
  void check('boot')
}
