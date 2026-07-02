import { defineStore } from 'pinia'
import { ref } from 'vue'
import { configureBackend } from '@/api/remoteBackend'
import { generateCode, loadOrCreateCode, normalizeCode, setStoredCode } from '@/api/workspaceCode'
import { loadAll } from '@/api/sync'

/**
 * Holds the active workspace code (the shareable short code that scopes all
 * remote data). Private by default — each device auto-gets its own persisted
 * code; entering another code joins that shared workspace.
 *
 * Changing the code re-points the backend and re-hydrates every resource, so no
 * view has to know which stores exist to refresh them.
 */
export const useWorkspace = defineStore('workspace', () => {
  const code = ref(loadOrCreateCode())
  configureBackend(code.value)

  async function applyCode(next: string): Promise<void> {
    code.value = next
    setStoredCode(next)
    configureBackend(next)
    await loadAll()
  }

  /** Join a workspace by code. Returns false when the code is empty/unchanged. */
  async function setCode(raw: string): Promise<boolean> {
    const next = normalizeCode(raw)
    if (!next || next === code.value) return false
    await applyCode(next)
    return true
  }

  /** Start a fresh, private workspace. */
  async function regenerate(): Promise<void> {
    await applyCode(generateCode())
  }

  return { code, setCode, regenerate }
})
