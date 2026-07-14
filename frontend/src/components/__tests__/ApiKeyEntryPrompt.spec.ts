import { describe, it, expect, beforeEach } from 'vitest'
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

  it('calls provideKey and hides the prompt when confirm is clicked', async () => {
    const { getKey, isPromptVisible } = useApiKey()
    const keyPromise = getKey()
    await Promise.resolve()

    const wrapper = mountPrompt()
    await wrapper.find('[data-testid="api-key-input"]').setValue('my-key')
    await wrapper.find('[data-testid="api-key-confirm"]').trigger('click')

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
})
