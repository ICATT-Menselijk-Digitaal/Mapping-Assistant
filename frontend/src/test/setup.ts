import { afterEach, vi } from 'vitest'
import { queryClient } from '@/api/queryClient'

// Node ≥ 25 ships a native global `localStorage` that Vitest's jsdom
// environment defers to instead of installing jsdom's own implementation,
// leaving `window.localStorage` as a stub without Storage methods. Install a
// self-contained in-memory Storage on both globalThis and window so tests
// don't depend on the host Node version's storage wiring.
class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length(): number {
    return this.data.size
  }
  clear(): void {
    this.data.clear()
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null
  }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value))
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const store = new MemoryStorage()
  Object.defineProperty(globalThis, name, { value: store, writable: true, configurable: true })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, { value: store, writable: true, configurable: true })
  }
}

/**
 * Global unit-test setup.
 *
 * Replaces the network-backed remote-storage client with an in-memory store
 * namespaced by `instanceId:userId`, so tests exercise the real repository /
 * vue-query / store code paths without ever touching the live server. State and
 * the query cache are reset after every test for isolation.
 */
const { stores } = vi.hoisted(() => ({ stores: new Map<string, Map<string, unknown>>() }))

vi.mock('remote-storage', () => {
  function nsMap(ns: string): Map<string, unknown> {
    let m = stores.get(ns)
    if (!m) {
      m = new Map()
      stores.set(ns, m)
    }
    return m
  }
  class RemoteStorage {
    private ns: string
    constructor(cfg: { userId?: string; instanceId?: string } = {}) {
      this.ns = `${cfg.instanceId}:${cfg.userId}`
    }
    async getItem<T>(key: string): Promise<T> {
      return (nsMap(this.ns).get(key) ?? null) as T
    }
    async setItem<T>(key: string, value: T): Promise<void> {
      nsMap(this.ns).set(key, value)
    }
    async removeItem(key: string): Promise<void> {
      nsMap(this.ns).delete(key)
    }
  }
  return { RemoteStorage }
})

afterEach(() => {
  stores.clear()
  queryClient.clear()
})
