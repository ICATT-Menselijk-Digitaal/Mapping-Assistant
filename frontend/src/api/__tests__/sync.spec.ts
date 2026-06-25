import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { registerResource, pollAll } from '../sync'

// This file imports only sync.ts (not resources.ts), so the registry contains
// just the fake resource(s) registered below.

describe('sync.pollAll', () => {
  it('drops a re-entrant poll while one is already in flight', async () => {
    let polls = 0
    let release!: () => void
    let blocker: Promise<void> = new Promise((r) => (release = r))

    registerResource({
      poll: () => {
        polls++
        return blocker
      },
      load: async () => {},
      remoteAhead: ref(false),
      acceptRemote: () => {},
    })

    const first = pollAll()
    const second = pollAll() // first is still in flight → must be skipped
    expect(polls).toBe(1)

    release()
    await Promise.all([first, second])

    // Once the in-flight poll settles, polling is allowed again.
    blocker = Promise.resolve()
    await pollAll()
    expect(polls).toBe(2)
  })
})
