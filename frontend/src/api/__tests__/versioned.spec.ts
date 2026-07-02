import { describe, it, expect } from 'vitest'
import { getVersioned, setVersioned, get, set } from '../remoteBackend'

describe('versioned envelope', () => {
  it('round-trips a value and stamps a unique rev', async () => {
    const a = await setVersioned('k-round', [1, 2, 3])
    expect(a.data).toEqual([1, 2, 3])
    expect(a.rev).toBeTruthy()

    const read = await getVersioned<number[]>('k-round')
    expect(read.data).toEqual([1, 2, 3])
    expect(read.rev).toBe(a.rev)
  })

  it('gives a different rev on each write (detects a concurrent change)', async () => {
    const first = await setVersioned('k-rev', { v: 1 })
    const second = await setVersioned('k-rev', { v: 1 })
    expect(second.rev).not.toBe(first.rev)
  })

  it('returns data null and rev "" when the key is absent', async () => {
    const read = await getVersioned<number[]>('k-missing')
    expect(read.data).toBeNull()
    expect(read.rev).toBe('')
  })

  it('unwraps a legacy raw value (written before versioning) with rev ""', async () => {
    // Simulate pre-envelope data written straight through the raw backend.
    await set('k-legacy', [9, 9])
    const read = await getVersioned<number[]>('k-legacy')
    expect(read.data).toEqual([9, 9])
    expect(read.rev).toBe('')
  })

  it('a later setVersioned re-envelopes a legacy value', async () => {
    await set('k-upgrade', { legacy: true })
    await setVersioned('k-upgrade', { legacy: false })
    const raw = await get<Record<string, unknown>>('k-upgrade', {})
    expect(raw).toHaveProperty('rev')
    expect(raw).toHaveProperty('data')
  })
})
