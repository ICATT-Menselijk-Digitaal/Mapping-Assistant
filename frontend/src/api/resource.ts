/**
 * A remote resource: the single data-module pattern every persisted entity uses
 * (mappings, schemas, AI stats). The vue-query cache entry at `key` is the one
 * source of truth; `state` is a reactive projection of it, kept in sync through
 * the cache's own notifications. So one path serves reads, optimistic writes,
 * polling, and test resets — no ref-vs-cache duplication.
 *
 * Writes are optimistic and synchronous: `write`/`update` set the cache (which
 * notifies synchronously, preserving the "create then use the result" contract)
 * and persist to the remote backend in the background. Polling reconciles remote
 * changes under a conflict policy: applied silently when local state is clean,
 * stashed behind `remoteAhead` when there are unsaved edits.
 */
import { ref, shallowRef, type Ref } from 'vue'
import { queryClient } from './queryClient'
import { getVersioned, setVersioned, type Versioned } from './remoteBackend'
import { registerResource } from './sync'

export interface ResourceCodec<TDomain, TStored> {
  encode: (value: TDomain) => TStored
  decode: (stored: TStored) => TDomain
}

export interface ResourceConfig<TDomain, TStored> {
  /** vue-query cache key (the source of truth). */
  key: readonly unknown[]
  /** remote-storage key. */
  storageKey: string
  /** Fresh empty value; must return a NEW instance each call. */
  initial: () => TDomain
  /** Translate domain ⇄ stored. Omit when they are identical. */
  codec?: ResourceCodec<TDomain, TStored>
}

export interface RemoteResource<TDomain> {
  /** Reactive projection of the cache entry. */
  state: Ref<TDomain>
  /** Unsaved local edits not yet confirmed persisted. */
  isDirty: () => boolean
  /** A remote change is waiting (local edits blocked auto-apply). */
  remoteAhead: Ref<boolean>
  /** Last persistence error, if any. */
  error: Ref<unknown>
  current: () => TDomain
  /** Optimistically replace the value and persist in the background. */
  write: (next: TDomain) => void
  /** Functional optimistic update; returns the new value synchronously. */
  update: (fn: (current: TDomain) => TDomain) => TDomain
  /** Hydrate from the remote backend for the active workspace. */
  load: () => Promise<TDomain>
  /** Poll the remote backend and reconcile under the conflict policy. */
  poll: () => Promise<void>
  /** Apply a stashed remote change, discarding local edits. */
  acceptRemote: () => void
  /** Dismiss a stashed remote change, keeping local edits. */
  dismissRemote: () => void
}

const INITIAL_REV = ''

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function defineRemoteResource<TDomain, TStored = TDomain>(
  config: ResourceConfig<TDomain, TStored>,
): RemoteResource<TDomain> {
  const { key, storageKey, initial } = config
  const codec: ResourceCodec<TDomain, TStored> =
    config.codec ??
    ({
      encode: (value) => value as unknown as TStored,
      decode: (stored) => stored as unknown as TDomain,
    })

  const state = shallowRef<TDomain>(queryClient.getQueryData<TDomain>(key) ?? initial())
  const remoteAhead = ref(false)
  const error = ref<unknown>(null)

  let rev = INITIAL_REV
  // "diverged since the last load/accept" — NOT merely "unsaved". A background
  // persist saves to the server but keeps the session diverged, so a later
  // remote change from another device still surfaces (rather than silently
  // replacing what the user has been working on). Cleared only by load/apply.
  let dirty = false
  let remoteStash: Versioned<TStored | null> | null = null
  let writeSeq = 0

  function current(): TDomain {
    const data = queryClient.getQueryData<TDomain>(key)
    return data === undefined ? initial() : data
  }

  function resetToInitial(): void {
    state.value = initial()
    rev = INITIAL_REV
    dirty = false
    remoteStash = null
    remoteAhead.value = false
    error.value = null
  }

  // Keep `state` synced to the cache. setQueryData notifies synchronously, and
  // queryClient.clear() (used between tests) emits 'removed' → a full reset, so
  // the singleton resource never leaks state across tests.
  const cache = queryClient.getQueryCache()
  cache.subscribe((event) => {
    if (!sameKey(event.query.queryKey, key)) return
    if (event.type === 'removed') {
      resetToInitial()
      return
    }
    const data = queryClient.getQueryData<TDomain>(key)
    state.value = data === undefined ? initial() : data
  })

  function applyRemote(env: Versioned<TStored | null>): void {
    queryClient.setQueryData(key, env.data == null ? initial() : codec.decode(env.data))
    rev = env.rev
    dirty = false
    remoteStash = null
    remoteAhead.value = false
  }

  function schedulePersist(next: TDomain): void {
    const seq = ++writeSeq
    void setVersioned<TStored>(storageKey, codec.encode(next))
      .then((env) => {
        if (seq !== writeSeq) return
        // Track our own write's rev so polls don't flag it as someone else's
        // change; stay dirty so a *real* remote divergence still surfaces.
        rev = env.rev
        error.value = null
      })
      .catch((e) => {
        if (seq === writeSeq) error.value = e
      })
  }

  function write(next: TDomain): void {
    queryClient.setQueryData(key, next)
    dirty = true
    schedulePersist(next)
  }

  function update(fn: (current: TDomain) => TDomain): TDomain {
    const next = fn(current())
    write(next)
    return next
  }

  async function load(): Promise<TDomain> {
    const env = await getVersioned<TStored>(storageKey)
    const value = env.data == null ? initial() : codec.decode(env.data)
    queryClient.setQueryData(key, value)
    rev = env.rev
    dirty = false
    remoteStash = null
    remoteAhead.value = false
    return value
  }

  async function poll(): Promise<void> {
    const env = await getVersioned<TStored>(storageKey)
    if (env.rev === rev) return
    if (dirty) {
      // Don't clobber unsaved local edits — surface the change instead.
      remoteStash = env
      remoteAhead.value = true
      return
    }
    applyRemote(env)
  }

  function acceptRemote(): void {
    if (remoteStash) applyRemote(remoteStash)
  }

  function dismissRemote(): void {
    remoteStash = null
    remoteAhead.value = false
  }

  registerResource({ poll, load, remoteAhead, acceptRemote })

  return {
    state,
    isDirty: () => dirty,
    remoteAhead,
    error,
    current,
    write,
    update,
    load,
    poll,
    acceptRemote,
    dismissRemote,
  }
}
