import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDB } from 'idb'
import { _closeDB, getVersioned, isStorageAvailable, setVersioned } from '../localBackend'

beforeEach(async () => {
  _closeDB()
  await deleteDB('mapping-assistent')
})

describe('getVersioned', () => {
  it('returns data null and rev "" when the key is absent', async () => {
    const result = await getVersioned('k-missing')
    expect(result).toEqual({ rev: '', updatedAt: 0, data: null })
  })

  it('reads back the envelope written by setVersioned', async () => {
    const written = await setVersioned('k-read', [1, 2, 3])
    const read = await getVersioned<number[]>('k-read')
    expect(read.data).toEqual([1, 2, 3])
    expect(read.rev).toBe(written.rev)
  })

  it('wraps a legacy raw value (non-envelope) with rev ""', async () => {
    const { openDB } = await import('idb')
    const raw = await openDB('mapping-assistent', 1, {
      upgrade(d) {
        d.createObjectStore('kv')
      },
    })
    await raw.put('kv', [9, 9], 'k-legacy')
    raw.close()

    const result = await getVersioned<number[]>('k-legacy')
    expect(result.data).toEqual([9, 9])
    expect(result.rev).toBe('')
  })
})

describe('setVersioned', () => {
  it('writes a versioned envelope and returns it', async () => {
    const env = await setVersioned('k-write', { foo: 'bar' })
    expect(env.data).toEqual({ foo: 'bar' })
    expect(env.rev).toBeTruthy()
    expect(env.updatedAt).toBeGreaterThan(0)
  })

  it('generates a unique rev on each write', async () => {
    const a = await setVersioned('k-rev', { v: 1 })
    const b = await setVersioned('k-rev', { v: 1 })
    expect(b.rev).not.toBe(a.rev)
  })
})

describe('isStorageAvailable', () => {
  it('returns true in a normal test environment', async () => {
    expect(await isStorageAvailable()).toBe(true)
  })
})
