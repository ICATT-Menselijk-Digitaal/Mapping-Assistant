import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineRemoteResource } from '../resource'
import { getVersioned, setVersioned } from '../remoteBackend'
import * as remoteBackend from '../remoteBackend'

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

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it('poll during in-flight write does not trigger conflict banner', async () => {
    const { resource, storageKey } = makeResource()

    // Establish a known rev on the server and sync the resource to it.
    resource.write([1])
    await flush() // write settles → rev = A, dirty = true

    // A separate device updates the server — creating rev B.
    await setVersioned(storageKey, [99])

    // Now start a second write (simulating a large-schema persist that's slow).
    // Block the setVersioned round-trip so pendingWriteCount stays > 0 during poll.
    let settleWrite!: () => void
    const writeHeld = new Promise<never>((_, __) => {
      settleWrite = () => __('settled')
    })
    // We want to hold the write open without it ever resolving during the test.
    const neverResolves = new Promise<Awaited<ReturnType<typeof remoteBackend.setVersioned>>>(
      () => {},
    )
    vi.spyOn(remoteBackend, 'setVersioned').mockReturnValueOnce(neverResolves)

    resource.write([2]) // dirty = true, pendingWriteCount = 1, write held open

    // Poll while our write is still in flight: it should NOT stash as a conflict.
    await resource.poll()

    expect(resource.remoteAhead.value).toBe(false) // no false conflict
    expect(resource.state.value).toEqual([2]) // local state intact

    void settleWrite // suppress unused-variable lint
    void writeHeld
  })

  it('genuine remote change after write settles is still detected', async () => {
    const { resource, storageKey } = makeResource()

    resource.write([1]) // local edit
    await flush() // write settles — pendingWriteCount back to 0, rev updated

    // A different device now writes a truly new value:
    await setVersioned(storageKey, [99])
    await resource.poll()

    expect(resource.remoteAhead.value).toBe(true) // genuine conflict surfaced
    expect(resource.state.value).toEqual([1]) // local state preserved

    resource.acceptRemote()
    expect(resource.state.value).toEqual([99])
    expect(resource.remoteAhead.value).toBe(false)
  })
})
