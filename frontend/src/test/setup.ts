import { afterEach } from 'vitest'
import { queryClient } from '@/api/queryClient'
import 'fake-indexeddb/auto'

// Node ≥ 25 ships a native global `localStorage` that Vitest's jsdom
// environment defers to instead of installing jsdom's own implementation,
// leaving `window.localStorage` as a stub without Storage methods. Install a
// self-contained in-memory Storage on both globalThis and window so tests
// don't depend on the host Node version's storage wiring.
class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length(): number {
    return this.data.size
  }
  clear(): void {
    this.data.clear()
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null
  }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value))
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const store = new MemoryStorage()
  Object.defineProperty(globalThis, name, { value: store, writable: true, configurable: true })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, { value: store, writable: true, configurable: true })
  }
}

afterEach(() => {
  localStorage.clear()
  queryClient.clear()
})
