/**
 * The local backend: a thin key/value layer over localStorage.
 *
 * Drop-in replacement for remoteBackend — same Versioned<T> envelope contract,
 * same getVersioned / setVersioned surface. No network calls, no workspace code,
 * no polling. State is scoped to this browser origin.
 */

export interface Versioned<T> {
  rev: string
  updatedAt: number
  data: T
}

const PREFIX = 'mapping-assistent:'

function nextRev(): string {
  const c = globalThis.crypto as Crypto | undefined
  const rnd =
    c && typeof c.randomUUID === 'function' ? c.randomUUID() : Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}-${rnd}`
}

function isEnvelope(v: unknown): v is Versioned<unknown> {
  return typeof v === 'object' && v !== null && 'rev' in v && 'updatedAt' in v && 'data' in v
}

function safeRead(key: string): unknown {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getVersioned<T>(key: string): Promise<Versioned<T | null>> {
  const raw = safeRead(key)
  if (isEnvelope(raw)) return Promise.resolve(raw as Versioned<T | null>)
  return Promise.resolve({ rev: '', updatedAt: 0, data: (raw ?? null) as T | null })
}

export function setVersioned<T>(key: string, data: T): Promise<Versioned<T>> {
  const env: Versioned<T> = { rev: nextRev(), updatedAt: Date.now(), data }
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(env))
    return Promise.resolve(env)
  } catch (e) {
    return Promise.reject(e)
  }
}

/** Returns true when localStorage is readable and writable in this browser context. */
export function isLocalStorageAvailable(): boolean {
  try {
    const probe = '__ls_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}
