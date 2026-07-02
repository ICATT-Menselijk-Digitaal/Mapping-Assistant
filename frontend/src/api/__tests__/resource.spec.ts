import { describe, it, expect } from 'vitest'
import { defineRemoteResource } from '../resource'
import { getVersioned, setVersioned } from '../remoteBackend'

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

  it('load hydrates state from the backend', async () => {
    const { resource, storageKey } = makeResource()
    await setVersioned(storageKey, [42])

    await resource.load()
    expect(resource.state.value).toEqual([42])
  })

  it('poll applies a remote change when local state is clean', async () => {
    const { resource, storageKey } = makeResource()
    await resource.load() // clean, rev ''

    await setVersioned(storageKey, [7]) // another device writes
    await resource.poll()

    expect(resource.state.value).toEqual([7])
    expect(resource.remoteAhead.value).toBe(false)
  })

  it('poll does not clobber a diverged session; acceptRemote applies it', async () => {
    const { resource, storageKey } = makeResource()

    resource.write([1]) // local edit -> diverged
    await flush() // our own write persisted (rev tracked, still diverged)

    await setVersioned(storageKey, [99]) // a different device overwrites
    await resource.poll()

    expect(resource.state.value).toEqual([1]) // not clobbered
    expect(resource.remoteAhead.value).toBe(true)

    resource.acceptRemote()
    expect(resource.state.value).toEqual([99])
    expect(resource.remoteAhead.value).toBe(false)
  })

  it('poll is a no-op when the rev is unchanged', async () => {
    const { resource, storageKey } = makeResource()
    await setVersioned(storageKey, [5])
    await resource.load() // rev now matches stored

    await resource.poll() // nothing new
    expect(resource.state.value).toEqual([5])
    expect(resource.remoteAhead.value).toBe(false)
  })
})
