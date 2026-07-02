/**
 * The remote backend: a thin key/value layer over FrigadeHQ/remote-storage.
 *
 * This is the one place that knows the data is remote. The per-entity api
 * modules (mappingsApi, schemasApi, aiStatsApi) call get/set/remove here; they
 * don't know or care that it's remote-storage. Swapping providers later is a
 * change to this file alone.
 *
 * Scoping: instanceId is a constant app namespace; userId is the shareable
 * workspace code. Re-`configureBackend()` with a new code to switch workspaces.
 */
import { RemoteStorage } from 'remote-storage'
import { loadOrCreateCode } from './workspaceCode'

const INSTANCE_ID = 'mapping-assistent'
const DEFAULT_SERVER_ADDRESS = 'https://remote-storage.xiduzo.com'

function serverAddress(): string {
  return (import.meta.env.VITE_REMOTE_STORAGE_URL as string | undefined) ?? DEFAULT_SERVER_ADDRESS
}

let client: RemoteStorage | null = null

/** (Re)create the client for a given workspace code (userId). */
export function configureBackend(workspaceCode: string): void {
  client = new RemoteStorage({
    serverAddress: serverAddress(),
    instanceId: INSTANCE_ID,
    userId: workspaceCode,
  })
}

/** Configure from the persisted/auto-generated code. Call once at startup. */
export function bootstrapBackend(): string {
  const code = loadOrCreateCode()
  configureBackend(code)
  return code
}

function getClient(): RemoteStorage {
  if (!client) bootstrapBackend()
  return client as RemoteStorage
}

/** Read a value; returns `fallback` when absent or on any transport error. */
export async function get<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await getClient().getItem<T | null>(key)
    return value ?? fallback
  } catch {
    return fallback
  }
}

/** Write a value. Errors propagate so the caller (a mutation) can react. */
export async function set<T>(key: string, value: T): Promise<void> {
  await getClient().setItem<T>(key, value)
}

export async function remove(key: string): Promise<void> {
  try {
    await getClient().removeItem(key)
  } catch {
    // best-effort delete
  }
}

/**
 * Versioned envelope. remote-storage is a plain key/value store with no etag,
 * timestamp or change feed, so we wrap every stored value in `{ rev, updatedAt,
 * data }` ourselves. `rev` is a unique write token (not a counter — counters
 * collide across devices and would hide a concurrent write); a poll compares it
 * to the rev a client last loaded to cheaply detect "someone else changed this".
 */
export interface Versioned<T> {
  rev: string
  updatedAt: number
  data: T
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

/**
 * Read a value and normalise it to an envelope. Absent → `data: null, rev: ''`.
 * A legacy raw value (written before versioning) also decodes to `rev: ''` so it
 * loads once and is re-enveloped on the next write.
 */
export async function getVersioned<T>(key: string): Promise<Versioned<T | null>> {
  const raw = await get<unknown>(key, null)
  if (isEnvelope(raw)) return raw as Versioned<T | null>
  return { rev: '', updatedAt: 0, data: (raw ?? null) as T | null }
}

/** Write a value wrapped in a fresh-rev envelope; returns the stored envelope. */
export async function setVersioned<T>(key: string, data: T): Promise<Versioned<T>> {
  const env: Versioned<T> = { rev: nextRev(), updatedAt: Date.now(), data }
  await set(key, env)
  return env
}
