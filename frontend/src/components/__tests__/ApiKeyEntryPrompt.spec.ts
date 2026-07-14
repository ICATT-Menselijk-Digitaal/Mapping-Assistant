import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ApiKeyEntryPrompt from '../ApiKeyEntryPrompt.vue'
import { useApiKey, resetApiKeyState } from '@/composables/useApiKey'

function mountPrompt() {
  return mount(ApiKeyEntryPrompt, {
    global: { stubs: { Teleport: true } },
    attachTo: document.body,
  })
}

beforeEach(() => {
  resetApiKeyState()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ApiKeyEntryPrompt', () => {
  it('is hidden when isPromptVisible is false', () => {
    const wrapper = mountPrompt()
    expect(wrapper.find('[data-testid="api-key-overlay"]').exists()).toBe(false)
  })

  it('is shown when isPromptVisible is true', async () => {
    const { getKey } = useApiKey()
    getKey() // triggers prompt without awaiting
    await Promise.resolve()

    const wrapper = mountPrompt()
    expect(wrapper.find('[data-testid="api-key-overlay"]').exists()).toBe(true)
  })

  it('confirm button is disabled when input is empty', async () => {
    const { getKey } = useApiKey()
    getKey()
    await Promise.resolve()

    const wrapper = mountPrompt()
    const confirmBtn = wrapper.find('[data-testid="api-key-confirm"]')
    expect(confirmBtn.attributes('disabled')).toBeDefined()
  })

  it('confirm button is enabled after typing a key', async () => {
    const { getKey } = useApiKey()
    getKey()
    await Promise.resolve()

    const wrapper = mountPrompt()
    await wrapper.find('[data-testid="api-key-input"]').setValue('sk-or-test')
    const confirmBtn = wrapper.find('[data-testid="api-key-confirm"]')
    expect(confirmBtn.attributes('disabled')).toBeUndefined()
  })

  // Scenario: Trial Visitor submits a valid key → prompt closes
  it('calls provideKey and hides the prompt when confirm is clicked with a valid key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }))

    const { getKey, isPromptVisible } = useApiKey()
    const keyPromise = getKey()
    await Promise.resolve()

    const wrapper = mountPrompt()
    await wrapper.find('[data-testid="api-key-input"]').setValue('my-key')
    await wrapper.find('[data-testid="api-key-confirm"]').trigger('click')
    // Wait for async onConfirm + validateKey to complete
    await Promise.resolve()
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(await keyPromise).toBe('my-key')
    expect(isPromptVisible.value).toBe(false)
  })

  it('calls cancel and hides the prompt when cancel is clicked', async () => {
    const { getKey, isPromptVisible } = useApiKey()
    const keyPromise = getKey()
    await Promise.resolve()

    const wrapper = mountPrompt()
    await wrapper.find('[data-testid="api-key-cancel"]').trigger('click')

    expect(await keyPromise).toBeNull()
    expect(isPromptVisible.value).toBe(false)
  })

  it('calls cancel when Escape is pressed', async () => {
    const { getKey, isPromptVisible } = useApiKey()
    const keyPromise = getKey()
    await Promise.resolve()

    mountPrompt()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(await keyPromise).toBeNull()
    expect(isPromptVisible.value).toBe(false)
  })

  // Scenario: Trial Visitor submits an invalid key → inline error shown, prompt stays open
  it('shows an inline error and keeps prompt open when key is invalid (401)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }))

    const { getKey, isPromptVisible } = useApiKey()
    getKey()
    await Promise.resolve()

    const wrapper = mountPrompt()
    await wrapper.find('[data-testid="api-key-input"]').setValue('bad-key')
    await wrapper.find('[data-testid="api-key-confirm"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="api-key-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="api-key-error"]').text()).toContain(
      'Dit is geen geldige API-sleutel',
    )
    expect(isPromptVisible.value).toBe(true)
  })

  // Scenario: Validation call fails due to network error → different inline error, prompt stays open
  it('shows a network error message and keeps prompt open when unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network failure'))

    const { getKey, isPromptVisible } = useApiKey()
    getKey()
    await Promise.resolve()

    const wrapper = mountPrompt()
    await wrapper.find('[data-testid="api-key-input"]').setValue('any-key')
    await wrapper.find('[data-testid="api-key-confirm"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="api-key-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="api-key-error"]').text()).toContain(
      'Kon de sleutel niet valideren',
    )
    expect(isPromptVisible.value).toBe(true)
  })

  // Scenario: Confirm button shows loading state while validating
  it('disables the confirm button and shows loading text while validating', async () => {
    let resolveFetch!: (value: Response) => void
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )

    const { getKey } = useApiKey()
    getKey()
    await Promise.resolve()

    const wrapper = mountPrompt()
    await wrapper.find('[data-testid="api-key-input"]').setValue('sk-or-test')
    wrapper.find('[data-testid="api-key-confirm"]').trigger('click')
    // Let the async confirm handler start
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    const confirmBtn = wrapper.find('[data-testid="api-key-confirm"]')
    expect(confirmBtn.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="api-key-loading"]').exists()).toBe(true)

    resolveFetch(new Response(null, { status: 200 }))
  })
})
