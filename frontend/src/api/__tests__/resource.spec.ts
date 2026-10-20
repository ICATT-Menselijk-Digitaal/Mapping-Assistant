import { describe, it, expect, vi } from 'vitest'
import { defineRemoteResource } from '../resource'
import { getVersioned, setVersioned } from '../localBackend'
import * as localBackend from '../localBackend'

// Each resource is a singleton keyed on its cache key, so give every test a
// fresh key to keep them independent (the global setup clears the cache between
// tests, which resets any resource via the cache 'removed' event).
let seq = 0
function makeResource() {
  seq += 1
  return {
    storageKey: `res-${seq}`,
    resource: defineRemoteResource<number[]>({
      key: ['res', seq],
      storageKey: `res-${seq}`,
      initial: () => [],
    }),
  }
}

// Let the fire-and-forget persist settle.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('defineRemoteResource', () => {
  it('write updates state synchronously and persists in the background', async () => {
    const { resource, storageKey } = makeResource()

    resource.write([1, 2])
    expect(resource.state.value).toEqual([1, 2]) // synchronous — no await

    await flush()
    const env = await getVersioned<number[]>(storageKey)
    expect(env.data).toEqual([1, 2])
  })

  it('update returns the next value synchronously', () => {
    const { resource } = makeResource()
    const next = resource.update((current) => [...current, 9])
    expect(next).toEqual([9])
    expect(resource.state.value).toEqual([9])
  })

  it('load hydrates state from localStorage', async () => {
    const { resource, storageKey } = makeResource()
    await setVersioned(storageKey, [42])

    await resource.load()
    expect(resource.state.value).toEqual([42])
  })

  it('load returns initial value when localStorage key is absent', async () => {
    const { resource } = makeResource()
    const value = await resource.load()
    expect(value).toEqual([])
    expect(resource.state.value).toEqual([])
  })

  it('write then load round-trips the value', async () => {
    const { resource } = makeResource()
    resource.write([5, 6, 7])
    await flush()

    await resource.load()
    expect(resource.state.value).toEqual([5, 6, 7])
  })

  it('sets error when setVersioned rejects (e.g. quota exceeded)', async () => {
    const { resource } = makeResource()
    vi.spyOn(localBackend, 'setVersioned').mockRejectedValueOnce(
      new DOMException('QuotaExceededError'),
    )

    resource.write([1])
    await flush()

    expect(resource.error.value).toBeInstanceOf(DOMException)
  })
})
