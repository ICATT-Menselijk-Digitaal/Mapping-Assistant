import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory stand-in for the network-backed RemoteStorage client, namespaced by
// instanceId:userId so we can assert workspace isolation.
const { stores } = vi.hoisted(() => ({ stores: new Map<string, Map<string, unknown>>() }))

vi.mock('remote-storage', () => {
  class RemoteStorage {
    private ns: string
    constructor(cfg: { userId?: string; instanceId?: string } = {}) {
      this.ns = `${cfg.instanceId}:${cfg.userId}`
      if (!stores.has(this.ns)) stores.set(this.ns, new Map())
    }
    async getItem<T>(key: string): Promise<T> {
      return (stores.get(this.ns)!.get(key) ?? null) as T
    }
    async setItem<T>(key: string, value: T): Promise<void> {
      stores.get(this.ns)!.set(key, value)
    }
    async removeItem(key: string): Promise<void> {
      stores.get(this.ns)!.delete(key)
    }
  }
  return { RemoteStorage }
})

import { configureBackend, get, remove, set } from '../remoteBackend'

describe('remoteBackend', () => {
  beforeEach(() => {
    stores.clear()
    configureBackend('USER1')
  })

  it('returns the fallback when a key is absent', async () => {
    expect(await get('missing', [])).toEqual([])
  })

  it('round-trips a value', async () => {
    await set('k', { a: 1 })
    expect(await get('k', null)).toEqual({ a: 1 })
  })

  it('removes a value', async () => {
    await set('k', 1)
    await remove('k')
    expect(await get('k', 'fallback')).toBe('fallback')
  })

  it('isolates data per workspace code (the sharing boundary)', async () => {
    await set('k', 'one')
    configureBackend('USER2')
    expect(await get('k', 'none')).toBe('none')
    configureBackend('USER1')
    expect(await get('k', 'none')).toBe('one')
  })
})
