import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useApiKey, resetApiKeyState } from '../useApiKey'

beforeEach(() => {
  resetApiKeyState()
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('useApiKey', () => {
  // Scenario: No prompt shown when a team key is configured
  it('returns the env var key without showing the prompt', async () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'env-key-123')
    const { getKey, isPromptVisible } = useApiKey()

    const key = await getKey()

    expect(key).toBe('env-key-123')
    expect(isPromptVisible.value).toBe(false)
  })

  // Scenario: Trial Visitor triggers mapping/transformation suggestion without a key
  it('shows the prompt when no env var key is set', async () => {
    const { getKey, isPromptVisible, provideKey } = useApiKey()

    const keyPromise = getKey()
    expect(isPromptVisible.value).toBe(true)

    provideKey('visitor-key-abc')
    const key = await keyPromise

    expect(key).toBe('visitor-key-abc')
    expect(isPromptVisible.value).toBe(false)
  })

  // Scenario: Trial Visitor enters a key and the suggestion proceeds
  it('resolves with the entered key after provideKey is called', async () => {
    const { getKey, provideKey } = useApiKey()

    const keyPromise = getKey()
    provideKey('my-secret-key')

    expect(await keyPromise).toBe('my-secret-key')
  })

  // Scenario: Trial Visitor cancels the prompt
  it('resolves null and hides the prompt when cancelled', async () => {
    const { getKey, isPromptVisible, cancel } = useApiKey()

    const keyPromise = getKey()
    expect(isPromptVisible.value).toBe(true)

    cancel()
    const key = await keyPromise

    expect(key).toBeNull()
    expect(isPromptVisible.value).toBe(false)
  })

  it('reuses the session key for subsequent getKey calls without showing prompt again', async () => {
    const { getKey, isPromptVisible, provideKey } = useApiKey()

    const first = getKey()
    provideKey('reused-key')
    await first

    const second = await getKey()
    expect(second).toBe('reused-key')
    expect(isPromptVisible.value).toBe(false)
  })
})
