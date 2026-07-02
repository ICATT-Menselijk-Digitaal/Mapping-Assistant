import { beforeEach, describe, expect, it } from 'vitest'
import { configureBackend, get, remove, set } from '../remoteBackend'

// remote-storage is mocked in-memory globally (src/test/setup.ts).

describe('remoteBackend', () => {
  beforeEach(() => {
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
