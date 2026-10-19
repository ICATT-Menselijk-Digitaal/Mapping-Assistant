import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getVersioned, isLocalStorageAvailable, setVersioned } from '../localBackend'

beforeEach(() => {
  localStorage.clear()
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

  it('handles a corrupt localStorage entry gracefully (returns empty envelope)', async () => {
    localStorage.setItem('mapping-assistent:k-corrupt', 'not-valid-json{{{')
    const result = await getVersioned('k-corrupt')
    expect(result).toEqual({ rev: '', updatedAt: 0, data: null })
  })

  it('wraps a legacy raw value (non-envelope) with rev ""', async () => {
    localStorage.setItem('mapping-assistent:k-legacy', JSON.stringify([9, 9]))
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

  it('persists using the mapping-assistent: prefix so keys are namespaced', async () => {
    await setVersioned('mappings', [])
    expect(localStorage.getItem('mapping-assistent:mappings')).not.toBeNull()
  })

  it('silently swallows a write failure and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError')
    })
    await expect(setVersioned('k-fail', 'x')).resolves.toBeDefined()
    warnSpy.mockRestore()
  })
})

describe('isLocalStorageAvailable', () => {
  it('returns true in a normal test environment', () => {
    expect(isLocalStorageAvailable()).toBe(true)
  })

  it('returns false when localStorage.setItem throws', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('SecurityError')
    })
    expect(isLocalStorageAvailable()).toBe(false)
  })
})
