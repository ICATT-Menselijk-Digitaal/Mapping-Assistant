/**
 * The sync engine. remote-storage has no push channel, so "real-time" is
 * polling: on an interval every registered resource fetches its envelope and
 * reconciles. The conflict policy lives in the resource (see defineRemoteResource):
 * a remote change is applied silently when the local copy is clean, and stashed
 * (surfaced via `remoteAhead`) when the user has unsaved edits — it is never
 * overwritten mid-session.
 *
 * This module owns the registry + cadence and nothing backend-specific, so the
 * data-layer orchestration that used to live in a view (load on mount, reload on
 * workspace change) now lives here behind `loadAll()`.
 */
import { computed, type Ref } from 'vue'

export interface SyncableResource {
  /** Fetch the remote envelope and reconcile under the conflict policy. */
  poll: () => Promise<void>
  /** Replace local state with the remote value for the active workspace. */
  load: () => Promise<unknown>
  /** A remote change is waiting that we did not apply (local edits pending). */
  remoteAhead: Ref<boolean>
  /** Apply the waiting remote change, discarding local edits. */
  acceptRemote: () => void
}

const resources = new Set<SyncableResource>()

/** Resources register themselves on creation; the registry drives poll/load. */
export function registerResource(resource: SyncableResource): void {
  resources.add(resource)
}

export const DEFAULT_POLL_INTERVAL_MS = 2000

let timer: ReturnType<typeof setInterval> | null = null

/** Poll + reconcile every resource. Individual failures are swallowed. */
export async function pollAll(): Promise<void> {
  await Promise.all([...resources].map((r) => r.poll().catch(() => {})))
}

/** (Re)hydrate every resource — on app start and on workspace-code change. */
export async function loadAll(): Promise<void> {
  await Promise.all([...resources].map((r) => r.load().catch(() => {})))
}

export function startSync(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): void {
  stopSync()
  timer = setInterval(() => {
    void pollAll()
  }, intervalMs)
}

export function stopSync(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** True when any resource has an unapplied remote change. The banner watches this. */
export const remoteUpdatePending = computed(() => [...resources].some((r) => r.remoteAhead.value))

/** Apply every waiting remote change (the banner's "reload" action). */
export function acceptRemoteUpdates(): void {
  resources.forEach((r) => r.acceptRemote())
}
