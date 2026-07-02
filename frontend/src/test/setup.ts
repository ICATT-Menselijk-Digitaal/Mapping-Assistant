import { afterEach, vi } from 'vitest'
import { queryClient } from '@/api/queryClient'

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
