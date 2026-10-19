/**
 * A local resource: the single data-module pattern every persisted entity uses
 * (mappings, schemas, AI stats). The vue-query cache entry at `key` is the one
 * source of truth; `state` is a reactive projection of it, kept in sync through
 * the cache's own notifications. So one path serves reads, optimistic writes,
 * and test resets — no ref-vs-cache duplication.
 *
 * Writes are optimistic and synchronous: `write`/`update` set the cache (which
 * notifies synchronously, preserving the "create then use the result" contract)
 * and persist to localStorage in the background.
 */
import { shallowRef, type Ref } from 'vue'
import { queryClient } from './queryClient'
import { getVersioned, setVersioned } from './localBackend'

export interface ResourceCodec<TDomain, TStored> {
  encode: (value: TDomain) => TStored
  decode: (stored: TStored) => TDomain
}

export interface ResourceConfig<TDomain, TStored> {
  /** vue-query cache key (the source of truth). */
  key: readonly unknown[]
  /** localStorage key (without the mapping-assistent: prefix). */
  storageKey: string
  /** Fresh empty value; must return a NEW instance each call. */
  initial: () => TDomain
  /** Translate domain ⇄ stored. Omit when they are identical. */
  codec?: ResourceCodec<TDomain, TStored>
}

export interface LocalResource<TDomain> {
  /** Reactive projection of the cache entry. */
  state: Ref<TDomain>
  /** Unsaved local edits not yet confirmed persisted. */
  isDirty: () => boolean
  /** Last persistence error, if any. */
  error: Ref<unknown>
  current: () => TDomain
  /** Optimistically replace the value and persist in the background. */
  write: (next: TDomain) => void
  /** Functional optimistic update; returns the new value synchronously. */
  update: (fn: (current: TDomain) => TDomain) => TDomain
  /** Hydrate from localStorage. */
  load: () => Promise<TDomain>
}

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function defineRemoteResource<TDomain, TStored = TDomain>(
  config: ResourceConfig<TDomain, TStored>,
): LocalResource<TDomain> {
  const { key, storageKey, initial } = config
  const codec: ResourceCodec<TDomain, TStored> = config.codec ?? {
    encode: (value) => value as unknown as TStored,
    decode: (stored) => stored as unknown as TDomain,
  }

  const state = shallowRef<TDomain>(queryClient.getQueryData<TDomain>(key) ?? initial())
  const error = shallowRef<unknown>(null)

  let dirty = false
  let writeSeq = 0

  function current(): TDomain {
    const data = queryClient.getQueryData<TDomain>(key)
    return data === undefined ? initial() : data
  }

  function resetToInitial(): void {
    state.value = initial()
    dirty = false
    error.value = null
  }

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

  function schedulePersist(next: TDomain): void {
    const seq = ++writeSeq
    void setVersioned<TStored>(storageKey, codec.encode(next))
      .then(() => {
        if (seq !== writeSeq) return
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
    dirty = false
    return value
  }

  return {
    state,
    isDirty: () => dirty,
    error,
    current,
    write,
    update,
    load,
  }
}

// Keep old export name for composables that haven't been updated yet.
export type RemoteResource<T> = LocalResource<T>
