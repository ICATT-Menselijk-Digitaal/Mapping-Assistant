import { ref } from 'vue'

const STORAGE_KEY = 'ma_openrouter_api_key'

const sessionKey = ref<string | null>(null)
const isPromptVisible = ref(false)
const isValidating = ref(false)
let pendingResolve: ((key: string | null) => void) | null = null

export async function validateKey(key: string): Promise<'valid' | 'invalid' | 'unreachable'> {
  isValidating.value = true
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (response.ok) return 'valid'
    if (response.status === 401 || response.status === 403) return 'invalid'
    return 'unreachable'
  } catch {
    return 'unreachable'
  } finally {
    isValidating.value = false
  }
}

export function useApiKey() {
  async function getKey(): Promise<string | null> {
    const envKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
    if (envKey) return envKey

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return stored
    } catch {
      // localStorage unavailable (e.g. private browsing) — fall through
    }

    if (sessionKey.value) return sessionKey.value

    isPromptVisible.value = true
    return new Promise((resolve) => {
      pendingResolve = resolve
    })
  }

  function provideKey(key: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, key)
    } catch {
      // localStorage unavailable — key stored in session only
    }
    sessionKey.value = key
    isPromptVisible.value = false
    pendingResolve?.(key)
    pendingResolve = null
  }

  function cancel(): void {
    isPromptVisible.value = false
    pendingResolve?.(null)
    pendingResolve = null
  }

  function removeStoredKey(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage unavailable — nothing to remove
    }
    sessionKey.value = null
  }

  return { getKey, provideKey, cancel, removeStoredKey, isPromptVisible, isValidating, validateKey }
}

export function resetApiKeyState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  sessionKey.value = null
  isPromptVisible.value = false
  isValidating.value = false
  pendingResolve = null
}
