/**
 * The local backend: a thin key/value layer over IndexedDB.
 *
 * Drop-in replacement for the old localStorage backend — same Versioned<T>
 * envelope contract, same getVersioned / setVersioned surface. One database
 * ("mapping-assistent"), one object store ("kv"), values stored as JSON
 * objects. No indexes, no relational schema — just a KV store backed by
 * IndexedDB so we get the browser's full storage quota instead of the 5 MB
 * localStorage cap.
 */
import { openDB, type IDBPDatabase } from 'idb'

export interface Versioned<T> {
  rev: string
  updatedAt: number
  data: T
}

export interface StorageInfo {
  quota: number
  usage: number
  /** 0–1 */
  ratio: number
}

const DB_NAME = 'mapping-assistent'
const DB_VERSION = 1
const STORE = 'kv'

let _db: IDBPDatabase | null = null

async function db(): Promise<IDBPDatabase> {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE)
      }
    },
  })
  return _db
}

/** Close and release the DB handle. For use in tests only. */
export function _closeDB(): void {
  _db?.close()
  _db = null
}

function nextRev(): string {
  const c = globalThis.crypto as Crypto | undefined
  const rnd =
    c && typeof c.randomUUID === 'function' ? c.randomUUID() : Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}-${rnd}`
}

function isEnvelope(v: unknown): v is Versioned<unknown> {
  return typeof v === 'object' && v !== null && 'rev' in v && 'updatedAt' in v && 'data' in v
}

export async function getVersioned<T>(key: string): Promise<Versioned<T | null>> {
  try {
    const raw: unknown = await (await db()).get(STORE, key)
    if (isEnvelope(raw)) return raw as Versioned<T | null>
    return { rev: '', updatedAt: 0, data: (raw ?? null) as T | null }
  } catch {
    return { rev: '', updatedAt: 0, data: null }
  }
}

export async function setVersioned<T>(key: string, data: T): Promise<Versioned<T>> {
  const env: Versioned<T> = { rev: nextRev(), updatedAt: Date.now(), data }
  await (await db()).put(STORE, env, key)
  return env
}

/** Returns true when IndexedDB is accessible in this browser context. */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    await db()
    return true
  } catch {
    return false
  }
}

/**
 * Returns storage quota and usage from the Storage API.
 * Returns null when the API is unavailable (e.g. in tests).
 */
export async function getStorageInfo(): Promise<StorageInfo | null> {
  if (!navigator?.storage?.estimate) return null
  try {
    const { quota = 0, usage = 0 } = await navigator.storage.estimate()
    return { quota, usage, ratio: quota > 0 ? usage / quota : 0 }
  } catch {
    return null
  }
}
