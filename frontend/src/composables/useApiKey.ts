import { ref } from 'vue'

const sessionKey = ref<string | null>(null)
const isPromptVisible = ref(false)
let pendingResolve: ((key: string | null) => void) | null = null

export function useApiKey() {
  async function getKey(): Promise<string | null> {
    const envKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
    if (envKey) return envKey
    if (sessionKey.value) return sessionKey.value

    isPromptVisible.value = true
    return new Promise((resolve) => {
      pendingResolve = resolve
    })
  }

  function provideKey(key: string): void {
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

  return { getKey, provideKey, cancel, isPromptVisible }
}

export function resetApiKeyState(): void {
  sessionKey.value = null
  isPromptVisible.value = false
  pendingResolve = null
}
